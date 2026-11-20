import test from 'node:test';
import assert from 'node:assert/strict';
import {chooseServicePort,waitForService} from '../server/service-startup.ts';
import {serviceDatabaseURL} from '../server/service/database.ts';

test('personal SQLite ignores inherited PostgreSQL configuration and production requires PostgreSQL',()=>{
 const inherited={DATABASE_URL:'postgresql://database/omnidocs',OMNIDOCS_POSTGRES_HOST:'database'};
 assert.equal(serviceDatabaseURL({...inherited,OMNIDOCS_DATABASE_ENGINE:'sqlite'}),undefined);
 assert.equal(serviceDatabaseURL({...inherited,OMNIDOCS_DATABASE_ENGINE:'postgres'}),inherited.DATABASE_URL);
 assert.throws(()=>serviceDatabaseURL({OMNIDOCS_DATABASE_ENGINE:'postgres'}),/Configure a PostgreSQL connection/);
});

test('local startup chooses another port when an older server owns the default and never hides EPERM',async()=>{
 const checked:number[]=[];
 const port=await chooseServicePort(4174,async value=>{checked.push(value);if(value===4174)throw Object.assign(new Error('in use'),{code:'EADDRINUSE'});});
 assert.equal(port,4175);assert.deepEqual(checked,[4174,4175]);
 await assert.rejects(chooseServicePort(4174,async()=>{throw Object.assign(new Error('blocked'),{code:'EPERM'});}),/blocked/);
});

test('readiness rejects old frontend HTML and local-mode servers, accepting only the hosted API',async()=>{
 const replies=[new Response('<html>old server</html>',{headers:{'content-type':'text/html'}}),Response.json({mode:'local'}),Response.json({mode:'service'})];let count=0;
 await waitForService('http://127.0.0.1:4175',{get:(async()=>{count++;return replies.shift()!;}) as typeof fetch,pause:async()=>{},attempts:3});assert.equal(count,3);
 await assert.rejects(waitForService('http://127.0.0.1:4175',{get:(async()=>Response.json({mode:'local'})) as typeof fetch,pause:async()=>{},attempts:2}),/valid API response/);
 await assert.rejects(waitForService('http://127.0.0.1:4175',{alive:()=>false,pause:async()=>{}}),/stopped/);
});
