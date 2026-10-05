<?php
// Real Moodle fixture with synthetic learners only. This script never ships in the app.
define('CLI_SCRIPT', true);
require(__DIR__ . '/../.tools/moodle-test/moodle/config.php');
require_once($CFG->libdir . '/testing/generator/lib.php');
require_once($CFG->libdir . '/externallib.php');
require_once($CFG->dirroot . '/course/lib.php');
require_once($CFG->dirroot . '/mod/assign/locallib.php');
$CFG->noemailever = true;
$CFG->debug = 0;
$CFG->debugdisplay = false;
\core\session\manager::set_user(get_admin());
$file = __DIR__ . '/../.tools/moodle-test/fixture.json';
$config = json_decode(file_get_contents($file), true);
$mode = $argv[1] ?? 'seed';
if ($mode === 'probe') {
    $user = \core_user::get_user($config['userId']);
    \core\session\manager::set_user($user);
    echo json_encode(['rest' => has_capability('webservice/rest:use', context_system::instance()), 'confirmed' => $user->confirmed, 'suspended' => $user->suspended, 'deleted' => $user->deleted, 'protocols' => $CFG->webserviceprotocols, 'enabled' => $CFG->enablewebservices]);
    exit;
}
if (!empty($config['userId'])) {
    assign_capability('webservice/rest:use', CAP_ALLOW, $DB->get_field('role', 'id', ['shortname' => 'user']), context_system::instance());
    $DB->set_field('external_services', 'enabled', 1, ['shortname' => 'moodle_mobile_app']);
}
if ($mode === 'seed' && empty($config['courseId'])) {
    set_config('enablewebservices', 1);
    set_config('webserviceprotocols', 'rest');
    set_config('enablemobilewebservice', 1);
    $generator = new testing_data_generator();
    $course = $generator->create_course(['fullname' => 'Redes privadas de prueba', 'shortname' => 'LOCAL-TEST', 'numsections' => 2]);
    $password = 'Synthetic!' . bin2hex(random_bytes(12));
    $student = $generator->create_user(['username' => 'fixturelearner', 'firstname' => 'Alumno', 'lastname' => 'Sintético', 'email' => 'learner@example.invalid', 'password' => $password]);
    update_internal_user_password($student, $password);
    assign_capability('webservice/rest:use', CAP_ALLOW, $DB->get_field('role', 'id', ['shortname' => 'user']), context_system::instance());
    $DB->set_field('external_services', 'enabled', 1, ['shortname' => 'moodle_mobile_app']);
    $studentrole = $DB->get_field('role', 'id', ['shortname' => 'student']);
    $generator->enrol_user($student->id, $course->id, $studentrole);
    assign_capability('webservice/rest:use', CAP_ALLOW, $studentrole, context_system::instance());
    $assignment = $generator->create_module('assign', ['course' => $course->id, 'name' => 'Explicar cuatro bits', 'intro' => '<p>Justifica cuántas combinaciones permiten cuatro bits.</p>', 'introformat' => FORMAT_HTML, 'duedate' => time() + 86400, 'assignsubmission_onlinetext_enabled' => 1, 'assignfeedback_comments_enabled' => 1, 'submissiondrafts' => 0]);
    $withoutdate = $generator->create_module('assign', ['course' => $course->id, 'name' => 'Repaso sin fecha', 'intro' => '<p>Repasa potencias de dos.</p>', 'introformat' => FORMAT_HTML, 'duedate' => 0, 'assignsubmission_onlinetext_enabled' => 1]);
    $page = $generator->create_module('page', ['course' => $course->id, 'name' => 'Potencias de dos', 'content' => '<p>Con cuatro bits hay 2<sup>4</sup> = 16 combinaciones.</p>', 'contentformat' => FORMAT_HTML]);
    $resource = $generator->create_module('resource', ['course' => $course->id, 'name' => 'Apuntes de redes', 'defaultfilename' => 'apuntes.txt']);
    $otherresource = $generator->create_module('resource', ['course' => $course->id, 'name' => 'Otros apuntes', 'defaultfilename' => 'apuntes.txt']);
    $fs = get_file_storage();
    foreach ([[$resource, 'Potencias de dos: cuatro bits permiten dieciséis combinaciones.'], [$otherresource, 'Subnetting: una red /26 contiene 64 direcciones.']] as [$module, $text]) {
        $context = context_module::instance($module->cmid);
        $fs->delete_area_files($context->id, 'mod_resource', 'content', 0);
        $fs->create_file_from_string(['contextid' => $context->id, 'component' => 'mod_resource', 'filearea' => 'content', 'itemid' => 0, 'filepath' => '/', 'filename' => 'apuntes.txt', 'mimetype' => 'text/plain'], $text);
    }
    $generator->get_plugin_generator('mod_assign')->create_submission(['userid' => $student->id, 'cmid' => $assignment->cmid, 'onlinetext' => '<p>2 × 2 × 2 × 2 = 16 combinaciones.</p>', 'status' => 'submitted']);
    \core\session\manager::set_user(get_admin());
    $assign = new assign(context_module::instance($assignment->cmid), get_coursemodule_from_id('assign', $assignment->cmid), $course);
    $assign->save_grade($student->id, (object)['grade' => 80, 'attemptnumber' => 0, 'addattempt' => 0, 'applytoall' => 0, 'assignfeedbackcomments_editor' => ['text' => '<p>Buen cálculo. Explica por qué cada factor vale dos.</p>', 'format' => FORMAT_HTML]]);
    $functions = ['core_webservice_get_site_info', 'core_enrol_get_users_courses', 'core_course_get_contents', 'mod_assign_get_assignments', 'mod_assign_get_submission_status', 'gradereport_user_get_grade_items', 'mod_page_get_pages_by_courses'];
    $service = (object)['name' => 'Tutor read-only fixture', 'shortname' => 'tutor_fixture', 'enabled' => 1, 'restrictedusers' => 0, 'downloadfiles' => 1, 'uploadfiles' => 0, 'requiredcapability' => '', 'timecreated' => time()];
    $service->id = $DB->insert_record('external_services', $service);
    foreach ($functions as $function) $DB->insert_record('external_services_functions', (object)['externalserviceid' => $service->id, 'functionname' => $function]);
    $token = external_generate_token(EXTERNAL_TOKEN_PERMANENT, $service->id, $student->id, context_system::instance());
    $config += ['courseId' => (int)$course->id, 'userId' => (int)$student->id, 'token' => $token, 'learnerPassword' => $password, 'assignmentId' => (int)$assignment->id, 'assignmentModuleId' => (int)$assignment->cmid, 'resourceId' => (int)$resource->id, 'resourceModuleId' => (int)$resource->cmid, 'otherResourceModuleId' => (int)$otherresource->cmid, 'pageModuleId' => (int)$page->cmid, 'serviceId' => (int)$service->id];
    file_put_contents($file, json_encode($config, JSON_PRETTY_PRINT));
    rebuild_course_cache($course->id, true);
} else if ($mode === 'reset' || $mode === 'update') {
    $reset = $mode === 'reset';
    if ($reset) update_internal_user_password(\core_user::get_user($config['userId']), $config['learnerPassword']);
    $DB->set_field('assign', 'name', $reset ? 'Explicar cuatro bits' : 'Explicar cuatro bits · revisión', ['id' => $config['assignmentId']]);
    $DB->set_field('assign', 'duedate', time() + ($reset ? 1 : 3) * 86400, ['id' => $config['assignmentId']]);
    $course = get_course($config['courseId']);
    $assign = new assign(context_module::instance($config['assignmentModuleId']), get_coursemodule_from_id('assign', $config['assignmentModuleId']), $course);
    $assign->save_grade($config['userId'], (object)['grade' => $reset ? 80 : 95, 'attemptnumber' => 0, 'addattempt' => 0, 'applytoall' => 0, 'assignfeedbackcomments_editor' => ['text' => $reset ? '<p>Buen cálculo. Explica por qué cada factor vale dos.</p>' : '<p>Ahora la justificación está completa.</p>', 'format' => FORMAT_HTML]]);
    $context = context_module::instance($config['resourceModuleId']); $fs = get_file_storage();
    $fs->delete_area_files($context->id, 'mod_resource', 'content', 0);
    $fs->create_file_from_string(['contextid' => $context->id, 'component' => 'mod_resource', 'filearea' => 'content', 'itemid' => 0, 'filepath' => '/', 'filename' => 'apuntes.txt', 'mimetype' => 'text/plain'], $reset ? 'Potencias de dos: cuatro bits permiten dieciséis combinaciones.' : 'Versión dos: cinco bits permiten treinta y dos combinaciones.');
    $DB->set_field('resource', 'revision', $DB->get_field('resource', 'revision', ['id' => $config['resourceId']]) + 1, ['id' => $config['resourceId']]);
    rebuild_course_cache($config['courseId'], true);
    if ($reset) {
        set_coursemodule_visible($config['otherResourceModuleId'], 1);
        if (!$DB->record_exists('external_services_functions', ['externalserviceid' => $config['serviceId'], 'functionname' => 'gradereport_user_get_grade_items'])) $DB->insert_record('external_services_functions', (object)['externalserviceid' => $config['serviceId'], 'functionname' => 'gradereport_user_get_grade_items']);
    }
} else if ($mode === 'formats') {
    // Synthetic, generated resources only. The production app never uses this CLI fixture.
    $context = context_module::instance($config['resourceModuleId']); $fs = get_file_storage();
    $root = __DIR__ . '/../.tools/moodle-test/import-formats/';
    foreach (['presentacion.pptx', 'pagina.html', 'video.srt', 'video.vtt'] as $filename) {
        if (!is_file($root . $filename)) throw new Exception('Missing synthetic import fixture.');
        $existing = $fs->get_file($context->id, 'mod_resource', 'content', 0, '/', $filename);
        if ($existing) $existing->delete();
        $fs->create_file_from_pathname(['contextid' => $context->id, 'component' => 'mod_resource', 'filearea' => 'content', 'itemid' => 0, 'filepath' => '/', 'filename' => $filename], $root . $filename);
    }
    $DB->set_field('resource', 'revision', $DB->get_field('resource', 'revision', ['id' => $config['resourceId']]) + 1, ['id' => $config['resourceId']]);
    rebuild_course_cache($config['courseId'], true);
} else if ($mode === 'withdraw') {
    set_coursemodule_visible($config['otherResourceModuleId'], 0);
    rebuild_course_cache($config['courseId'], true);
} else if ($mode === 'restrict') {
    $DB->delete_records('external_services_functions', ['externalserviceid' => $config['serviceId'], 'functionname' => 'gradereport_user_get_grade_items']);
}
echo "Synthetic fixture action completed: $mode\n";
