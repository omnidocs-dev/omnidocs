import {deflateSync,crc32} from 'node:zlib';
import {randomInt} from 'node:crypto';
import type {SQL} from './database.ts';
import {digest,secret} from './security.ts';

export type CaptchaPurpose='login'|'register'|'admin';
export const captchaSchema=[
 'CREATE TABLE IF NOT EXISTS captcha_challenges (id TEXT PRIMARY KEY, purpose TEXT NOT NULL, client TEXT NOT NULL, answer TEXT NOT NULL, expires BIGINT NOT NULL)',
 'CREATE INDEX IF NOT EXISTS captcha_expiry ON captcha_challenges(expires)',
];

const glyphs=[
 [14,17,19,21,25,17,14],[4,12,4,4,4,4,14],[14,17,1,2,4,8,31],[30,1,1,14,1,1,30],
 [2,6,10,18,31,2,2],[31,16,16,30,1,1,30],[14,16,16,30,17,17,14],
 [31,1,2,4,8,8,8],[14,17,17,14,17,17,14],[14,17,17,15,1,1,14],
];
const width=186,height=55;
function pngChunk(type:string,data:Buffer){
 const content=Buffer.concat([Buffer.from(type),data]),length=Buffer.alloc(4),checksum=Buffer.alloc(4);
 length.writeUInt32BE(data.length);checksum.writeUInt32BE(crc32(content));
 return Buffer.concat([length,content,checksum]);
}
function render(digits:number[]){
 const pixels=Buffer.alloc((width+1)*height,244);
 for(let row=0;row<height;row++)pixels[row*(width+1)]=0;
 function dot(x:number,y:number,shade:number){
  if(x>=0&&x<width&&y>=0&&y<height)pixels[y*(width+1)+x+1]=shade;
 }
 for(let i=0;i<1150;i++)dot(randomInt(width),randomInt(height),randomInt(160,235));
 for(const [index,digit] of digits.entries()){
  const left=6+index*30+randomInt(4),top=randomInt(7,14),shear=randomInt(-2,3);
  for(const [row,mask] of glyphs[digit].entries()){
   for(let col=0;col<5;col++){
    if(!(mask&(1<<(4-col))))continue;
    for(let y=0;y<5;y++)for(let x=0;x<4;x++){
     dot(left+col*4+x+Math.round(row*shear/3),top+row*5+y+Math.round(col*shear/2),randomInt(27,58));
    }
   }
  }
 }
 for(let i=0;i<4;i++){
  const baseline=randomInt(8,height-7),phase=randomInt(30);
  for(let x=0;x<width;x++)dot(x,baseline+Math.round(6*Math.sin((x+phase)/19)),randomInt(84,157));
 }
 const header=Buffer.alloc(13);
 header.writeUInt32BE(width);header.writeUInt32BE(height,4);header[8]=8;
 return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),pngChunk('IHDR',header),
  pngChunk('IDAT',deflateSync(pixels)),pngChunk('IEND',Buffer.alloc(0))]);
}

export async function createCaptcha(sql:SQL,purpose:CaptchaPurpose,client:string){
 const id=secret(),digits=Array.from({length:6},()=>randomInt(10));
 await sql.run('INSERT INTO captcha_challenges(id,purpose,client,answer,expires) VALUES(?,?,?,?,?)',
  [id,purpose,client,digest(id+digits.join('')),Date.now()+180_000]);
 return {id,image:`data:image/png;base64,${render(digits).toString('base64')}`};
}

export async function consumeCaptcha(sql:SQL,purpose:CaptchaPurpose,client:string,id:string){
 const [record]=await sql.all<{answer:string}>(
  'DELETE FROM captcha_challenges WHERE id=? AND purpose=? AND client=? AND expires>? RETURNING answer',
  [id,purpose,client,Date.now()]);
 return record?.answer;
}
