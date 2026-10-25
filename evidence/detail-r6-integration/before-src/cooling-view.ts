// Absolute temperature scale: the same temperature always has the same colour.
export function coolantColor(celsius:number):string {
 const t=Math.max(0,Math.min(1,(celsius-20)/100));
 const stops=[[120,181,228],[164,191,184],[231,176,124],[235,119,107]];
 const p=t*3,i=Math.min(2,Math.floor(p)),f=p-i;
 return `rgb(${stops[i].map((v,k)=>Math.round(v+(stops[i+1][k]-v)*f)).join(',')})`;
}
export function coolingBranches(total:number,radiator:number,hot:number,cold:number){
 const q=Math.max(0,total),r=Math.max(0,Math.min(q,radiator));
 return {radiator:r,bypass:q-r,mixed:q>0?(r*cold+(q-r)*hot)/q:hot};
}
