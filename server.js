import { createApp } from './lib/app.js';
import { networkInterfaces } from 'node:os';
const port=Number(process.env.PORT||3000);
const {app,close}=createApp({dataDir:process.env.MHERO_DATA_DIR});
const server=app.listen(port,'0.0.0.0',()=>{
  console.log(`\nMHERO registration is running.\nHost Mac: http://localhost:${port}\nAdmin: http://localhost:${port}/admin`);
  for(const list of Object.values(networkInterfaces()))for(const address of list||[])if(address.family==='IPv4'&&!address.internal)console.log(`Tablet / game URL: http://${address.address}:${port}`);
  console.log('\nKeep this window open while the venue is running.\n');
});
server.on('error',error=>{console.error(error.code==='EADDRINUSE'?`Port ${port} is already in use. Another copy may be running.`:error.message);process.exitCode=1;close();});
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>server.close(()=>{close();process.exit(0);}));
