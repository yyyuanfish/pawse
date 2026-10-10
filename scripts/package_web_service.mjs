import {cpSync,mkdirSync,rmSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
const web=resolve(dirname(fileURLToPath(import.meta.url)),'../web');
rmSync(resolve(web,'deploy'),{recursive:true,force:true});
mkdirSync(resolve(web,'deploy'),{recursive:true});
cpSync(resolve(web,'dist'),resolve(web,'deploy/app'),{recursive:true});
