const fs=require('fs'),os=require('os'),path=require('path');
const q=v=>v==null?'':/[",\n]/.test(v)?'"'+String(v).replace(/"/g,'""')+'"':String(v);
exports.toCSV=t=>[t.cols.join(','),...t.rows.map(r=>t.cols.map(c=>q(r[c])).join(','))].join('\n')+'\n';
exports.writeDir=(files,mapping)=>{const d=fs.mkdtempSync(path.join(os.tmpdir(),'torob-'));for(const[n,c]of Object.entries(files))fs.writeFileSync(path.join(d,n),c);if(mapping!==undefined)fs.writeFileSync(path.join(d,'mapping.json'),typeof mapping==='string'?mapping:JSON.stringify(mapping));return d};
