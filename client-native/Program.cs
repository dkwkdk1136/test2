using System.Diagnostics;
using System.Net;
using System.Net.Security;
using System.Net.Sockets;
using System.Security.Authentication;
using System.Security.Cryptography.X509Certificates;
using System.Runtime.InteropServices;
using System.Text.Json;
using System.Collections.Concurrent;

namespace MetalRageLauncher;

public sealed record Settings(string Host, string ServerName, int AuthPort, int GamePort, string CaFile)
{
    public static Settings Load(string file)
    {
        var c = JsonSerializer.Deserialize<Settings>(File.ReadAllText(file), new JsonSerializerOptions { PropertyNameCaseInsensitive = true })
            ?? throw new IOException("Missing TLS settings.");
        if (string.IsNullOrWhiteSpace(c.Host) || Uri.CheckHostName(c.Host) == UriHostNameType.Unknown ||
            Uri.CheckHostName(c.ServerName) != UriHostNameType.Dns || string.IsNullOrWhiteSpace(c.CaFile) ||
            c.AuthPort is < 1 or > 65535 or 9211 or 30907 || c.GamePort is < 1 or > 65535 or 9211 or 30907 || c.AuthPort == c.GamePort)
            throw new IOException("Invalid TLS settings.");
        return c with { CaFile = Path.GetFullPath(Path.Combine(Path.GetDirectoryName(file)!, c.CaFile)) };
    }
}

public sealed class Bridge : IAsyncDisposable
{
    readonly Settings config;
    readonly X509Certificate2 ca;
    readonly CancellationTokenSource stop = new();
    readonly List<TcpListener> listeners = new();
    readonly List<Task> acceptors = new();
    readonly ConcurrentDictionary<int, Task> transfers = new();
    readonly SemaphoreSlim slots = new(128);
    readonly Action<string> log;
    int nextId;
    public int[] LocalPorts => listeners.Select(l => ((IPEndPoint)l.LocalEndpoint).Port).ToArray();
    public Bridge(Settings settings, Action<string>? logger = null)
    {
        config = settings;
        ca = X509Certificate2.CreateFromPem(File.ReadAllText(config.CaFile));
        log = logger ?? (_ => { });
    }
    public async Task<SslStream> Connect(int port, CancellationToken cancellation)
    {
        using var timeout = CancellationTokenSource.CreateLinkedTokenSource(cancellation);
        timeout.CancelAfter(TimeSpan.FromSeconds(10));
        var tcp = new TcpClient();
        SslStream? tls = null;
        try
        {
            await tcp.ConnectAsync(config.Host, port, timeout.Token);
            // NetworkStream owns the socket; disposing SslStream closes the connection.
            tls = new SslStream(new NetworkStream(tcp.Client, ownsSocket: true), false);
            var chain = new X509ChainPolicy { TrustMode = X509ChainTrustMode.CustomRootTrust,
                RevocationMode = X509RevocationMode.NoCheck, DisableCertificateDownloads = true };
            chain.CustomTrustStore.Add(ca);
            await tls.AuthenticateAsClientAsync(new SslClientAuthenticationOptions {
                TargetHost = config.ServerName, EnabledSslProtocols = SslProtocols.Tls13,
                CertificateChainPolicy = chain
            }, timeout.Token);
            if (tls.SslProtocol != SslProtocols.Tls13 || tls.NegotiatedCipherSuite != TlsCipherSuite.TLS_AES_256_GCM_SHA384)
                throw new AuthenticationException("Server must use TLS 1.3 / AES-256-GCM.");
            return tls;
        }
        catch { tls?.Dispose(); tcp.Dispose(); throw; }
    }
    public async Task Start(int authLocal = 9211, int gameLocal = 30907)
    {
        try
        {
            foreach (var pair in new[] { (authLocal, config.AuthPort), (gameLocal, config.GamePort) })
            {
                var listener = new TcpListener(IPAddress.Loopback, pair.Item1);
                listener.Server.ExclusiveAddressUse = true;
                listener.Start();
                listeners.Add(listener);
                acceptors.Add(Accept(listener, pair.Item2));
            }
            await Task.WhenAll(Probe(config.AuthPort), Probe(config.GamePort));
        }
        catch { await DisposeAsync(); throw; }
    }
    async Task Probe(int port) { using var stream = await Connect(port, stop.Token); }
    async Task Accept(TcpListener listener, int remotePort)
    {
        try
        {
            while (!stop.IsCancellationRequested)
            {
                var local = await listener.AcceptTcpClientAsync(stop.Token);
                if (!slots.Wait(0)) { local.Dispose(); continue; }
                int id = Interlocked.Increment(ref nextId);
                var task = Transfer(local, remotePort);
                transfers[id] = task;
                _ = task.ContinueWith(done => { transfers.TryRemove(id, out _); slots.Release(); }, TaskScheduler.Default);
            }
        }
        catch (OperationCanceledException) { }
        catch (Exception e) { if (!stop.IsCancellationRequested) { log(e.Message); stop.Cancel(); } }
    }
    async Task Transfer(TcpClient local, int port)
    {
        using (local)
        using (var session = CancellationTokenSource.CreateLinkedTokenSource(stop.Token))
        {
            try
            {
                using var remote = await Connect(port, session.Token);
                using var plain = local.GetStream();
                var upload = plain.CopyToAsync(remote, session.Token);
                var download = remote.CopyToAsync(plain, session.Token);
                await Task.WhenAny(upload, download);
                session.Cancel();
                local.Close(); remote.Close();
                try { await Task.WhenAll(upload, download); } catch (Exception) { }
            }
            catch (Exception e) { if (!stop.IsCancellationRequested) log("TLS connection closed: " + e.Message); }
        }
    }
    public async ValueTask DisposeAsync()
    {
        stop.Cancel();
        foreach (var listener in listeners) listener.Stop();
        await Task.WhenAll(acceptors);
        await Task.WhenAll(transfers.Values);
        // May also be called after Start's failure cleanup.
    }
}

internal static class Program
{
    static async Task ConfigureGameSehop(string game)
    {
        // Full path scopes the exception to this installed game. Preserve all other mitigations.
        const string script = " $ErrorActionPreference='Stop'; Import-Module ProcessMitigations; " +
            "Set-ProcessMitigation -Name $env:MRO_SEHOP_GAME -Disable SEHOP -ErrorAction Stop; " +
            "$p=Get-ProcessMitigation -Name $env:MRO_SEHOP_GAME -ErrorAction Stop; " +
            "if ([string]$p.SEHOP.Enable -ne 'OFF') { throw 'SEHOP setting verification failed' }";
        var start = new ProcessStartInfo(Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.Windows),
            "System32", "WindowsPowerShell", "v1.0", "powershell.exe")) {
            UseShellExecute = false, CreateNoWindow = true, WindowStyle = ProcessWindowStyle.Hidden,
            RedirectStandardOutput = true, RedirectStandardError = true
        };
        start.ArgumentList.Add("-NoProfile"); start.ArgumentList.Add("-NonInteractive");
        start.ArgumentList.Add("-EncodedCommand");
        start.ArgumentList.Add(Convert.ToBase64String(System.Text.Encoding.Unicode.GetBytes(script)));
        start.Environment["MRO_SEHOP_GAME"] = Path.GetFullPath(game);
        using var process = Process.Start(start) ?? throw new IOException("게임 SEHOP 설정을 시작하지 못했습니다.");
        var output = process.StandardOutput.ReadToEndAsync();
        var error = process.StandardError.ReadToEndAsync();
        using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(30));
        try { await process.WaitForExitAsync(timeout.Token); }
        catch (OperationCanceledException) { process.Kill(entireProcessTree: true); throw new IOException("게임 SEHOP 설정 시간이 초과되었습니다."); }
        await output;
        var details = await error;
        if (process.ExitCode != 0) throw new IOException("MetalRage.exe의 SEHOP 설정을 적용하지 못했습니다.\n" + details);
        Log("SEHOP disabled and verified for game path: " + game);
    }
    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    static extern int MessageBox(IntPtr window, string text, string title, uint flags);
    static readonly string LogFile = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "MetalRage", "launcher.log");
    static void Log(string message)
    {
        try { Directory.CreateDirectory(Path.GetDirectoryName(LogFile)!); lock (LogFile) File.AppendAllText(LogFile, DateTimeOffset.Now + " " + message + Environment.NewLine); } catch { }
    }
    [STAThread]
    static void Main()
    {
        try { Run().GetAwaiter().GetResult(); }
        catch (Exception e)
        {
            Log(e.ToString());
            MessageBox(IntPtr.Zero, "게임을 시작하지 못했습니다.\n\n" + e.Message + "\n\n로그: " + LogFile, "Metal Rage Online", 0x10);
        }
    }
    static async Task Run()
    {
        if (!OperatingSystem.IsWindowsVersionAtLeast(10, 0, 22000))
            throw new PlatformNotSupportedException("이 TLS 런처는 Windows 11 이상이 필요합니다.");
        var root = AppContext.BaseDirectory;
        var gameDir = Path.Combine(root, "data", "System");
        var game = Path.Combine(gameDir, "MetalRage.exe");
        if (!File.Exists(game)) throw new FileNotFoundException("MetalRage.exe를 찾을 수 없습니다. 런처를 data 폴더 옆에 놓으세요.");
        await ConfigureGameSehop(game);
        var config = Settings.Load(Path.Combine(root, "TLS", "bridge.json"));
        await using var bridge = new Bridge(config, Log);
        await bridge.Start();
        Log("Both TLS endpoints verified. Starting game.");
        var info = new ProcessStartInfo(game) { WorkingDirectory = gameDir, UseShellExecute = false };
        info.ArgumentList.Add("-globalid=TW&ip=127.0.0.1&port=9211&age=30");
        using var child = Process.Start(info) ?? throw new IOException("게임 프로세스를 시작하지 못했습니다.");
        await child.WaitForExitAsync();
        Log("Game exited: " + child.ExitCode);
        if (child.ExitCode != 0) throw new IOException("게임이 오류 코드 " + child.ExitCode + "로 종료되었습니다.");
    }
}
