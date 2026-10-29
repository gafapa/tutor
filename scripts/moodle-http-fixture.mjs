import http from 'node:http';
import assert from 'node:assert/strict';

// A deterministic REST double, not a Moodle installation or live-site qualification.
export async function startMoodleHttpFixture() {
  const state = { failCourse: 0, userId: 9, emptyName: false, revision: 1, submissionFailure: false, delayMs: 0, submissionText: '<p>Mi explicación original</p>', fileContent: 'Resolución personal: compruebo el resultado.', fileFailure: false, fileRedirect: false, attempt: 0, previousAttempts: [], submissionStatus: 'submitted' };
  const token = 'SyntheticMoodlePrivateToken';
  const requests = [];
  state.quiz = false;
  state.quizAttempts = [{ id: 1, quiz: 20, userid: 9, attempt: 1, preview: 0, state: 'finished', timestart: 1700000000, timefinish: 1700000100 }];
  let siteUrl;
  const functions = ['core_webservice_get_site_info', 'core_enrol_get_users_courses', 'core_course_get_contents', 'mod_assign_get_assignments', 'mod_assign_get_submission_status', 'gradereport_user_get_grade_items', 'mod_page_get_pages_by_courses', 'mod_quiz_get_user_attempts', 'mod_quiz_get_attempt_review'];
  const server = http.createServer(async (request, response) => {
    try {
      const chunks = []; for await (const chunk of request) chunks.push(chunk);
      const body = new URLSearchParams(Buffer.concat(chunks).toString('utf8'));
      assert.equal(request.url.includes(token), false);
      if (request.url.startsWith('/webservice/pluginfile.php/')) {
        assert.equal(body.get('token'), token);
        requests.push({ fn: 'download' });
        if (state.fileFailure) throw new Error('Synthetic file outage');
        if (state.fileRedirect) { response.writeHead(302, { Location: 'https://invalid.example/file' }); response.end(); return; }
        response.setHeader('Content-Type', 'text/plain'); response.end(state.fileContent); return;
      }
      const fn = body.get('wsfunction');
      assert.ok(functions.includes(fn), `Only allowlisted read functions may be called: ${fn}`);
      assert.ok(body.get('wstoken'));
      requests.push({ fn, courseId: body.get('courseid') ?? body.get('courseids[0]'), userId: body.get('userid') });
      const courseId = Number(body.get('courseid') ?? body.get('courseids[0]') ?? Math.floor(Number(body.get('assignid')) / 100));
      if (state.delayMs && fn === 'core_course_get_contents') await new Promise(resolve => setTimeout(resolve, state.delayMs));
      if (state.failCourse === courseId && fn === 'core_course_get_contents') throw new Error('Synthetic course outage');
      let result;
      if (fn === 'core_webservice_get_site_info') result = { userid: state.userId, sitename: 'Aula sintética', siteurl: siteUrl, downloadfiles: 1, functions: functions.filter(name => state.quiz || !name.startsWith('mod_quiz_')).map(name => ({ name })) };
      else if (fn === 'core_enrol_get_users_courses') result = [{ id: 1, fullname: 'Matemáticas', shortname: 'MATH' }, { id: 2, fullname: state.emptyName ? '' : 'Redes', shortname: 'NET' }];
      else if (fn === 'core_course_get_contents') result = [
        { id: courseId * 10, name: `Tema ${courseId}`, summary: `<p>Resumen de ${courseId === 1 ? 'fracciones' : 'subredes'} v${state.revision}</p>`, modules: [
          { id: courseId * 100 + 1, name: `Tarea ${courseId}`, modname: 'assign', uservisible: true, url: `${siteUrl}/mod/assign/view.php?id=${courseId * 100 + 1}` },
          { id: courseId * 100 + 2, name: `Lectura ${courseId}`, modname: 'label', uservisible: true, description: `<p>Explicación de ${courseId === 1 ? 'fracciones' : 'subredes'} v${state.revision}</p><script>forbidden()</script>` },
          { id: courseId * 100 + 3, name: `Página ${courseId}`, modname: 'page', uservisible: true, url: `${siteUrl}/mod/page/view.php?id=${courseId * 100 + 3}` },
          { id: courseId * 100 + 4, name: 'Hidden module', modname: 'label', uservisible: false, description: '<p>Hidden module text</p>' },
          ...(state.quiz && courseId === 1 ? [{ id: 120, instance: 20, name: 'Cuestionario de prueba', modname: 'quiz', uservisible: true, dates: [{ dataid: 'timeclose', timestamp: 1800000000 }], url: `${siteUrl}/mod/quiz/view.php?id=120` }] : [])
        ] },
        { id: courseId * 10 + 1, uservisible: false, summary: '<p>Hidden section text</p>', modules: [{id:courseId*100+5,name:'Hidden section module',modname:'label',description:'Hidden section module text'}] }
      ];
      else if (fn === 'mod_assign_get_assignments') result = { courses: [{ assignments: [{ id: courseId * 100 + 1, cmid: courseId * 100 + 1, intro: '<p>Descripción breve</p>', activity: '<p>Enunciado completo con cuatro pasos</p>', duedate: 0 }] }], warnings: [] };
      else if (fn === 'mod_assign_get_submission_status') {
        if (state.submissionFailure) throw new Error('Synthetic submission outage');
        assert.equal(Number(body.get('userid')), state.userId);
        const submission = {status:state.submissionStatus,attemptnumber:state.attempt,timecreated:1700000000,timemodified:1700000010,plugins:[{type:'onlinetext',editorfields:[{name:'onlinetext',text:state.submissionText}]},{type:'file',fileareas:[{area:'submission_files',files:[{filename:'resolución.txt',filepath:'/',filesize:120,fileurl:`${siteUrl}/pluginfile.php/5/assignsubmission_file/submission_files/9/resolution.txt?token=${token}&sesskey=private`,timemodified:1700000010}]}]}]};
        result = {previousattempts:state.previousAttempts,lastattempt:{[courseId===2?'teamsubmission':'submission']:submission},assignmentdata:{activity:'<p>Enunciado completo disponible desde la entrega</p>'},feedback:{plugins:[{editorfields:[{name:'comments',text:'<p>Comentario recuperado</p>'}]}]},warnings:[]};
      } else if (fn === 'mod_page_get_pages_by_courses') result = {pages:[{coursemodule:courseId*100+3,content:`<p>Apuntes de ${courseId===1?'fracciones':'subredes'}</p>`,timemodified:1700000000}],warnings:[]};
      else if (fn === 'gradereport_user_get_grade_items') result = {usergrades:[{userid:state.userId,gradeitems:[]}],warnings:[]};
      else if (fn === 'mod_quiz_get_user_attempts') { assert.equal(Number(body.get('userid')), state.userId); result = { attempts: state.quizAttempts, warnings: [] }; }
      else if (fn === 'mod_quiz_get_attempt_review') {
        const attempt = state.quizAttempts.find(row => row.id === Number(body.get('attemptid')));
        assert.equal(attempt.state, 'finished'); result = { attempt: { ...attempt, sumgrades: 1 }, grade: 10, questions: [{ slot: 1, html: '<p>Mi respuesta</p><input value="16">' }] };
      }
      response.setHeader('Content-Type','application/json'); response.end(JSON.stringify(result));
    } catch (error) {
      response.statusCode=500; response.end('Synthetic fixture failure');
    }
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  siteUrl=`http://127.0.0.1:${server.address().port}`;
  return {siteUrl,token,state,requests,stop:()=>new Promise(resolve=>{server.close(resolve);server.closeAllConnections();})};
}
