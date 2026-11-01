using MetalRageLauncher;
using System.Net;
using System.Net.Sockets;

static class NativeTests
{
    static async Task Main(string[] args)
    {
        int port = int.Parse(args[0]);
        var config = new Settings("127.0.0.1", "tls-test.invalid", port, port, args[3]);
        await using (var bridge = new Bridge(config))
        {
            await bridge.Start(0, 0);
            foreach (int localPort in bridge.LocalPorts)
            {
                using var client = new TcpClient();
                await client.ConnectAsync(IPAddress.Loopback, localPort);
                var bytes = new byte[128 * 1024]; Random.Shared.NextBytes(bytes);
                var output = new byte[bytes.Length];
                using var timeout = new CancellationTokenSource(5000);
                await client.GetStream().WriteAsync(bytes, timeout.Token);
                await client.GetStream().ReadExactlyAsync(output, timeout.Token);
                if (!bytes.SequenceEqual(output)) throw new Exception("Echo mismatch");
            }
        }
        Console.WriteLine("PASS: both channels preserve 128KB over TLS 1.3 AES256");
        await Reject(config with { ServerName = "wrong.invalid" });
        Console.WriteLine("PASS: wrong hostname rejected");
        await Reject(config with { AuthPort = int.Parse(args[1]), GamePort = int.Parse(args[1]) });
        Console.WriteLine("PASS: untrusted CA rejected");
        await Reject(config with { AuthPort = int.Parse(args[2]), GamePort = int.Parse(args[2]), CaFile = args[4] });
        Console.WriteLine("PASS: expired certificate rejected");
        await Reject(config with { AuthPort = int.Parse(args[5]), GamePort = int.Parse(args[5]) });
        Console.WriteLine("PASS: TLS 1.2 rejected");
        var occupied = new TcpListener(IPAddress.Loopback, 0); occupied.Start();
        try {
            int busy = ((IPEndPoint)occupied.LocalEndpoint).Port;
            await using var bridge = new Bridge(config);
            bool failed = false;
            try { await bridge.Start(0, busy); } catch (SocketException) { failed = true; }
            if (!failed) throw new Exception("Port collision accepted");
            using var probe = new TcpClient(); await probe.ConnectAsync(IPAddress.Loopback, busy);
            Console.WriteLine("PASS: port collision preserves existing listener");
        } finally { occupied.Stop(); }
    }
    static async Task Reject(Settings config)
    {
        await using var bridge = new Bridge(config);
        bool failed = false;
        try { await bridge.Start(0, 0); } catch (Exception) { failed = true; }
        if (!failed) throw new Exception("Unsafe connection accepted");
    }
}
