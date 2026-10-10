import {cpSync,mkdirSync,rmSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
execFileSync('npm',['run','build','--prefix','web'],{stdio:'inherit'});
rmSync('dist',{recursive:true,force:true});mkdirSync('dist',{recursive:true});
cpSync('site','dist',{recursive:true});cpSync('web/dist','dist/app',{recursive:true});
console.log('Pawse landing + app built in dist/');
