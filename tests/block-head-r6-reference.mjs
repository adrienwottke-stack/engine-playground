import {writeFile} from 'node:fs/promises';
const urls=[
'https://media.motorteiledirekt.de/MQwqeLFt3HSUjIdOFbtHPYri1WvdylHhvRdE6Q2_Z3c/s%3A700%3A700/bG9jYWw6Ly8vY2F0YWxvZy9wcm9kdWN0Ly8yLzAvMjAyNC0xMC0yNC1mYzQzZTdlZS1iOGJlLTQyNTUtOWI4YS05YzBhMTIzMDY0ZjEuanBlZw.jpg',
'https://media.motorteiledirekt.de/Vix0L6frItn-TwG1Xeh0vFx4RuCUkuAvMkAMU7ExcqA/s%3A700%3A700/bG9jYWw6Ly8vY2F0YWxvZy9wcm9kdWN0Ly8yLzAvMjAyNC0xMC0yNC01YTVmMWE0MS03YWNjLTQxZjUtYjYxNS0zYzNmZjhkYjg4NGIuanBlZw.jpg',
'https://media.motorteiledirekt.de/ECcJwny96Dma6vGq6cMrt2SeUGBlCETgmPQchOspj6Q/s%3A700%3A700/bG9jYWw6Ly8vY2F0YWxvZy9wcm9kdWN0Ly8yLzAvMjAyNC0xMC0yNC05N2EwZDliZi00ZTJiLTQzMWItYmVjYS0wOTc3MTlkOWZkMTkuanBlZw.jpg',
'https://media.motorteiledirekt.de/tITeobEpx9ARw9thUe4SyLLP11cKFgBDKY35Mzjr9Kg/s%3A700%3A700/bG9jYWw6Ly8vY2F0YWxvZy9wcm9kdWN0Ly8yLzAvMjAyNC0xMC0yNC0yN2Q5MjVhNi03YjZkLTQ2YzAtYjY4NC02ZWIyYTA4NTQ5NTEuanBlZw.jpg',
'https://media.motorteiledirekt.de/a1GqWM1Hc-Ht8XK2PMSDthKJAkzan_j2Ej-nUfw7HPY/s%3A700%3A700/bG9jYWw6Ly8vY2F0YWxvZy9wcm9kdWN0Ly8yLzAvMjAyNC0xMC0yNC03ZTQ4OWY3ZC04Nzk3LTQzNzMtYjI5NC1iMWU0OWJiOTg3OGIuanBlZw.jpg'];
const results=await Promise.allSettled(urls.map(async(url,i)=>{const r=await fetch(url.replaceAll('%3A',':'));if(!r.ok)throw new Error(String(r.status));await writeFile(`evidence/block-head-r6/reference/head-${i+1}.jpg`,Buffer.from(await r.arrayBuffer()));return {url,file:`head-${i+1}.jpg`};}));await writeFile('evidence/block-head-r6/reference/sources.json',JSON.stringify(results,null,2));console.log(results.map(r=>r.status));

