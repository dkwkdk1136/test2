const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

test('account, credentials and starter items commit together or all roll back', async () => {
    for (const failAt of [null, 'account_credentials', 'items']) {
        const writes=[];let committed=false,rolledBack=false,released=false;
        const conn={beginTransaction:async()=>{},commit:async()=>{committed=true;},rollback:async()=>{rolledBack=true;},release:()=>{released=true;},
            execute:async(sql,args)=>{writes.push([sql,args]);if(failAt && sql.startsWith('INSERT INTO '+failAt+' '))throw new Error('simulated write failure');return [{insertId:101}];}};
        const pool={getConnection:async()=>conn};
        const source=fs.readFileSync(path.join(__dirname,'../database/db.js'),'utf8');
        const ctx={module:{exports:{}},__dirname:path.join(__dirname,'../database'),console:{log(){}},require:(name)=>{
            if(name==='mysql2/promise')return {createPool:()=>pool};
            if(name==='./item-share-type')return {};
            if(name==='../config/server')return {getAccountSettings:()=>({startingCredits:100000,grantAllItemsAndMaxCredits:false})};
            if(name==='./config.json')throw new Error('test has no database');
            return require(name);
        }};
        vm.runInNewContext(source,ctx);
        const action=ctx.module.exports.createAccount('NewUser','NewUser',101,'scrypt-test');
        if(failAt)await assert.rejects(action,/simulated/);else assert.equal(await action,101);
        assert.equal(committed,failAt===null);assert.equal(rolledBack,failAt!==null);assert.equal(released,true);
        assert.ok(writes.some(([sql,args])=>sql.includes('account_credentials') && args[1]==='scrypt-test'));
    }
});
