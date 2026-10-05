import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { MoodleClient } from '../electron/moodle';
async function server(handler: http.RequestListener) {
  const instance = http.createServer(handler); await new Promise<void>(r => instance.listen(0, '127.0.0.1', r)); const address = instance.address(); assert.ok(address && typeof address === 'object');
  return { instance, url: `http://127.0.0.1:${address.port}`, close: () => new Promise<void>(r => instance.close(() => r())) };
}
async function fixture(mode: 'foreign' | 'redirect' | 'direct') {
  let foreignRequests = 0, downloads = 0; const foreign = await server((_request, response) => { foreignRequests++; response.end('externo'); });
  const token = 'SyntheticSecretNotInUrls'; let base = '';
  const site = await server(async (request, response) => {
    const chunks: Buffer[] = []; for await (const chunk of request) chunks.push(Buffer.from(chunk)); const body = new URLSearchParams(Buffer.concat(chunks).toString('utf8'));
    assert.equal(request.url?.includes(token), false);
    if (request.url?.includes('pluginfile.php')) {
      downloads++; assert.equal(body.get('token'), token); assert.equal(request.url?.includes('/webservice/webservice/'), false);
      if (mode === 'redirect') { response.writeHead(302, { Location: foreign.url + '/download' }); response.end(); } else response.end('Cuatro bits permiten dieciséis combinaciones.'); return;
    }
    assert.equal(body.get('wstoken'), token); const fn = body.get('wsfunction');
    const functions = ['core_webservice_get_site_info','core_enrol_get_users_courses','core_course_get_contents','mod_assign_get_assignments','mod_assign_get_submission_status','gradereport_user_get_grade_items','mod_page_get_pages_by_courses'];
    let result: unknown;
    if (fn === 'core_webservice_get_site_info') result = { userid: 9, siteurl: base, sitename: 'Synthetic Moodle', downloadfiles: 1, functions: functions.map(name => ({ name })) };
    else if (fn === 'core_enrol_get_users_courses') result = [{ id: 2, fullname: 'Redes', shortname: 'R' }];
    else if (fn === 'core_course_get_contents') result = [{ id: 1, modules: [{ id: 11, name: 'Apuntes', modname: 'resource', uservisible: true, contents: [{ type: 'file', filename: 'apuntes.txt', filepath: '/', filesize: 40, fileurl: (mode === 'foreign' ? foreign.url : base) + '/webservice/pluginfile.php/12/mod_resource/content/0/apuntes.txt' }] }] }];
    else if (fn === 'mod_assign_get_assignments') result = { courses: [{ assignments: [] }], warnings: [] };
    else if (fn === 'gradereport_user_get_grade_items') result = { usergrades: [{ userid: 9, gradeitems: [] }], warnings: [] };
    else result = { exception: 'webservice_access_exception', errorcode: 'accessexception' };
    response.setHeader('Content-Type', 'application/json'); response.end(JSON.stringify(result));
  }); base = site.url;
  return { client: new MoodleClient({ siteUrl: base, userId: 9, token }, new AbortController().signal), foreignCount: () => foreignRequests, downloads: () => downloads, close: async () => { await site.close(); await foreign.close(); } };
}
test('las credenciales de Moodle nunca se envían a un archivo de otro origen', async () => {
  const f = await fixture('foreign'); try { const result = await f.client.collect(2, []); assert.equal(f.foreignCount(), 0); assert.equal(f.downloads(), 0); assert.equal(result.scopes.resources, 'partial'); assert.equal(result.rows[0].cache?.resourceState, 'unavailable'); } finally { await f.close(); }
});
test('las redirecciones de descarga no reenvían credenciales ni eliminan datos anteriores', async () => {
  const f = await fixture('redirect'); try { const result = await f.client.collect(2, []); assert.equal(f.downloads(), 1); assert.equal(f.foreignCount(), 0); assert.equal(result.scopes.resources, 'partial'); assert.equal(result.rows[0].material, undefined); } finally { await f.close(); }
});
test('la descarga usa la ruta de Moodle una sola vez y el token va en el cuerpo', async () => {
  const f = await fixture('direct'); try { const result = await f.client.collect(2, []); assert.equal(result.scopes.resources, 'ok'); assert.equal(f.downloads(), 1); assert.equal(f.foreignCount(), 0); assert.ok(result.rows[0].material?.text.includes('dieciséis')); } finally { await f.close(); }
});
