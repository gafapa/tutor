import { startMoodle } from './moodle-test-server.mjs';
import { createRequire } from 'node:module';
const {MoodleClient}=createRequire(import.meta.url)('../build/electron/moodle.js');
const fixture = await startMoodle();
try {
 const response = await fetch(fixture.siteUrl + '/webservice/rest/server.php', { method:'POST', body:new URLSearchParams({ wstoken:fixture.config.token, wsfunction:'core_webservice_get_site_info', moodlewsrestformat:'json' }) });
 const result = await response.json(); console.log(JSON.stringify(result.exception ? { exception:result.exception, errorcode:result.errorcode, message:String(result.message).split(fixture.config.token).join('[omitted]') } : { sitename:result.sitename, useridMatches:result.userid===fixture.config.userId, functions:result.functions?.map(f=>f.name),downloadfiles:result.downloadfiles }));
 if(!result.exception){const batch=await new MoodleClient({siteUrl:fixture.siteUrl,userId:fixture.config.userId,token:fixture.config.token},new AbortController().signal).collect(fixture.config.courseId,[]);console.log(JSON.stringify(batch.rows.filter(r=>r.data.kind==='resource').map(r=>({key:r.remoteKey,data:r.data,cache:r.cache,hasText:Boolean(r.material)}))));const r=batch.rows.find(r=>r.data.kind==='resource'&&r.data.format==='txt');const download=await fetch(r.data.url,{method:'POST',body:new URLSearchParams({token:fixture.config.token})});console.log(JSON.stringify({status:download.status,body:(await download.text()).slice(0,180)}));}
}finally {await fixture.stop();}
