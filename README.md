# Tutor Local

[![Pruebas](https://github.com/gafapa/tutor/actions/workflows/tests.yml/badge.svg)](https://github.com/gafapa/tutor/actions/workflows/tests.yml)

Tutor personal de escritorio para Windows de 64 bits, en desarrollo. Los datos y las respuestas de la IA se procesan en el ordenador del alumno. El alcance completo y sus avances se registran en [los 80 requisitos](docs/requirements.md).

## Instalación

Descarga el archivo `Tutor-Local-0.13.0-Instalador.exe` desde [GitHub Releases](https://github.com/gafapa/tutor/releases) y sigue el asistente en castellano. La aplicación incluye sus dependencias y el motor de IA; el alumno no necesita Python, Node.js ni Ollama. El archivo `.sha256` y el comprobante `verification.json` acompañan al instalador.

En **Ajustes → Tu tutor local**, el alumno puede activar explícitamente la descarga de Qwen 2.5 1.5B cuantizado (1,12 GB). La descarga procede del repositorio de Qwen en Hugging Face y se verifica con SHA-256. Después, la tutoría funciona sin Internet. La organización, la biblioteca y el banco de ejercicios funcionan sin descargar el modelo.

Esta compilación de desarrollo todavía no dispone de firma de código. No incluye actualizaciones automáticas.

## Funciones de la versión 0.13

- Búsqueda por significado en materiales actuales, ejercicios, entregas, portfolio y reflexiones, con filtros de materia, concepto, resultado y fechas, orden temporal y páginas de resultados. Cada coincidencia abre el registro original. El modelo multilingüe E5 small INT8 se incluye en el instalador; no hace peticiones de red ni requiere una descarga adicional.
- El tutor recupera materiales y ejercicios relacionados con la pregunta dentro de la asignatura y conserva las referencias usadas. Si el buscador semántico falla, indica que utilizó la búsqueda por palabras. El contexto sigue limitado a 6.000 caracteres.
- Asignaturas independientes con curso, nivel académico, profesor y objetivos. Su configuración se puede editar conservando los materiales y el historial.
- Importación local de PDF con texto, DOCX, PPTX, TXT, Markdown, páginas HTML guardadas y subtítulos SRT/VTT, además de apuntes escritos. Hasta 20 MB por archivo, 30 archivos por selección y 300 páginas/diapositivas. PPTX conserva el orden declarado, texto, tablas y notas del profesor; las diapositivas vacías mantienen su posición. Las transcripciones conservan tiempos y voz, agrupadas en hasta 300 secciones.
- Lectura en un proceso separado con progreso y cancelación. Los documentos Office tienen límites de 5000 entradas, 32 MB por parte y 100 MB descomprimidos, comprobación de tamaños y CRC y rechazo de XML malformado o externo. El HTML se convierte en texto sin ejecutar scripts ni cargar enlaces, imágenes o estilos externos. La importación se cancela al borrar la asignatura, restaurar datos o iniciar un simulacro.
- Captura local de imágenes PNG/JPEG/WebP y PDF escaneados con páginas seleccionadas. OCR en castellano, gallego, inglés o castellano-inglés, con giro, ampliación, fragmentos dudosos y revisión obligatoria. Imagen original reducida y revisiones cifradas; guardado como apuntes o resolución personal sin corregir. El manuscrito y las fórmulas requieren revisión manual y todavía no tienen una calidad validada.
- Registro de versiones de materiales y detección de importaciones duplicadas por contenido.
- Tutor conversacional local con modos de preguntas y pistas, explicación y práctica. Recuperación textual de fragmentos de la asignatura actual, con fuente y página disponibles.
- Conceptos y prerrequisitos dentro de cada asignatura.
- Currículo propio: competencias, criterios de evaluación, saberes/contenidos y resultados de aprendizaje de FP. Relaciones entre elementos y vínculos con conceptos, unidades y tareas.
- Unidades ordenadas con objetivos, fechas, estado pendiente/en curso/impartida, materiales versionados y prerrequisitos. El orden respeta esos prerrequisitos; indicar que una unidad está impartida no demuestra dominio.
- Banco inicial de ejercicios de fracciones, porcentajes, ecuaciones de primer grado, potencias de 2, sistema binario y subnetting, con corrección determinista y registro de pistas y tiempo.
- Clasificación de los ejercicios comprobados del banco: contenido, dificultad, razonamiento, prerrequisitos y elementos curriculares vinculados. Cada intento conserva la clasificación y los títulos del currículo del momento de la entrega.
- Evaluación inicial con percepción del alumno por bloques, hasta dos preguntas por concepto y recorrido que vuelve a un prerrequisito cuando aparece una dificultad. Las respuestas se guardan al enviarlas; se puede pausar, cerrar la app y retomar. La corrección se muestra al terminar, con evidencias y una reflexión personal.
- Plan diario por asignatura con presupuesto de tiempo, tareas próximas, refuerzo y comprobación de prerrequisitos. Cada recomendación muestra el motivo y enlaza los intentos que la justifican.
- Tareas manuales con fecha, conceptos, unidad y currículo vinculados, duración prevista, edición y estado pendiente/terminado. Completar una tarea no demuestra dominio.
- Repaso espaciado de conceptos a partir de ejercicios comprobados, con fechas de próximas comprobaciones y acceso directo al bloque elegido.
- Flashcards manuales y propuestas generadas localmente desde fragmentos literales de materiales o errores comprobados. Los borradores requieren aprobación; conservan la página, versión o ejercicio de origen. Los cambios mantienen versiones y repasos anteriores y reinician el calendario de la nueva versión. La valoración del recuerdo organiza el repaso de la tarjeta y no modifica el dominio del concepto.
- Portfolio automático de ejercicios comprobados correctos sin pistas, una vez por concepto y enunciado. Selecciones personales de trabajos, proyectos y reflexiones con evidencias del historial; búsqueda y consulta de esas evidencias.
- Eventos educativos de finalización, fallo, consolidación y recuperación del estado de refuerzo. Los cambios de estado/confianza registrados al enviar ejercicios conservan la estimación anterior y posterior.
- Registro manual de ejercicios identificado como autoevaluación.
- Estimaciones de dominio y confianza con enlaces a ejercicios concretos. Las autoevaluaciones no se utilizan para afirmar dominio.
- Sesiones de 10, 20 y 30 minutos con objetivo, conceptos, unidad, tarea y versiones de materiales elegidas. Se guardan pausas, tiempo confirmado, ejercicios y repasos realizados en marcha. La revisión final registra qué se aprendió, qué costó, el siguiente paso y una autoevaluación; estos datos no demuestran dominio por sí solos.
- Simulacros del banco con selección de conceptos/unidad, dificultad máxima, número de preguntas y plazo. Respetan las unidades en curso o impartidas, evitan preguntas duplicadas y conservan las respuestas confirmadas. Las ayudas, materiales y soluciones quedan bloqueados desde la API hasta terminar o interrumpir. La corrección posterior genera una evidencia por pregunta; una pregunta sin respuesta queda sin corregir.
- Rúbricas propias con entre 2 y 6 niveles, hasta 12 criterios y un descriptor por criterio/nivel. Conceptos y currículo vinculados, tabla comparativa y versiones conservadas en cada edición.
- Entregas de texto, proyectos y prácticas de hasta 50.000 caracteres; copia desde ejercicios o portfolio, enunciado y materiales utilizados con su versión. Cada entrega conserva la versión de la rúbrica con la que se preparó.
- Revisión personal por criterios, niveles justificados con fragmentos literales, feedback, siguiente paso y reflexión. Una nueva revisión enlaza la anterior sin sobrescribirla. El alumno puede localizar las citas en la entrega original.
- Propuesta de niveles con IA local: compara cada criterio con la entrega, selecciona niveles y fragmentos y los comprueba antes de guardar el conjunto. El alumno contrasta las citas con el descriptor original y escribe su explicación en una revisión personal. Si una cita no existe, la respuesta queda incompleta o la consulta se cancela, no se guarda una revisión parcial. Las propuestas y autoevaluaciones quedan separadas de los ejercicios comprobados y no cambian el dominio del concepto.
- Conexión de lectura con Moodle: cursos propios, tareas, fechas, entregas de texto, comentarios y notas. Recursos PDF/DOCX/PPTX/TXT/MD/HTML/SRT/VTT y páginas del curso incorporados a la biblioteca local.
- Sincronización manual o automática cada 15, 30 o 60 minutos con la app abierta; cancelación, registro de altas/cambios/retiradas y versiones inmutables. Los cambios personales de títulos, fechas y estado de tareas se conservan. Las notas importadas no crean evidencias de dominio.
- **Cómo aprendo**: revisión de igualdades numéricas por pasos, con aritmética exacta y enlace al primer cálculo incorrecto comprobable. Admite fracciones, decimales, potencias, porcentajes y paréntesis; los pasos con álgebra, unidades o texto no interpretado quedan para revisión personal.
- Observaciones personales o propuestas de la IA local con fragmentos literales del ejercicio o entrega. Se pueden aceptar, rechazar o dejar de usar con un motivo y una evidencia posterior, sin sobrescribir su historial ni alterar el dominio de conceptos.
- Perfil compartido de lectura, gráficas, problemas, escritura, cálculo y lógica. Solo usa observaciones aceptadas; las copias y análisis repetidos no suman trabajos independientes. Para apoyar una hipótesis requiere al menos tres trabajos, dos asignaturas y dos días; las observaciones contrarias reducen la confianza.
- Refuerzos con dos actividades de práctica y una comprobación disponible otro día. Los cálculos incorrectos comprobados generan variantes; también utiliza el banco existente o actividades abiertas sin corrección automática. Guarda respuestas, ayudas, duración y reflexión sobre qué estrategia funcionó. El tutor puede recuperar una observación aceptada y esa ayuda previa de la asignatura consultada.
- **Conectar materias**: grafo navegable de asignaturas, conceptos, competencias, prerrequisitos y evidencias. Permite buscar, filtrar, ampliar y abrir el trabajo original; identifica las copias de portfolio, rúbrica y proyecto para distinguirlas de los ejercicios.
- Propuestas de conexión por coincidencia del nombre de conceptos, con comparación y confirmación personal. Equivalencias, prerrequisitos y relaciones temáticas conservan motivo e historial de aceptación, rechazo o retirada. Los prerrequisitos se comprueban conjuntamente para evitar ciclos, incluso al combinar equivalencias.
- Transferencia de conocimientos entre materias: cuando una conexión aceptada parte de un concepto consolidado con ejercicios comprobados y repaso vigente, propone comprobar su aplicación en la otra materia y muestra las evidencias. Practicar abre la asignatura de destino; la recomendación nunca cambia su dominio automáticamente. El tutor recupera una recomendación relevante y acotada para esa asignatura.
- Proyectos compartidos editables, manuales o propuestos desde conexiones confirmadas. Conservan participantes, conceptos, currículo, instrucciones, fechas, duración y versiones. Cada actividad admite copias exactas de ejercicios, entregas o portfolio, con reflexión y origen; su finalización personal exige trabajos de las materias participantes y conserva revisiones. El plan diario incorpora sus actividades pendientes y respeta su orden cuando coinciden fecha y prioridad.
- **Mis metas**: mejora de bloques, preparación de pruebas, recuperación y profundización con criterio personal, conceptos, fecha y días de práctica previstos. Conserva versiones, reflexiones y ejercicios elegidos; permite pausar, retomar, considerar alcanzada o dejar de seguir una meta. Las decisiones personales no cambian dominio ni notas.
- El plan prioriza las metas en marcha según fecha y necesidades, dentro del presupuesto. Un día de práctica sin pistas cuenta una vez, también si el intento es incorrecto; completar el ritmo previsto no alcanza automáticamente la meta.
- **Evolución por fechas**, en Mi aprendizaje: estados y confianza reconstruidos con ejercicios comprobados, antes del periodo, al cierre de los días con intentos y al cierre elegido. Gráfico interactivo, periodos de hasta un año y acceso a los originales. El panel muestra los cambios de los últimos 30 días, separando primeras evidencias, mejora, dificultad y necesidad de comprobar el recuerdo.
- Avisos personales apoyados en evidencias: cambio tras consolidación, dificultad persistente, autonomía por comprobar, repaso de evidencias antiguas y ausencia de actividad registrada. Se puede guardar una reflexión; nuevos ejercicios pueden producir otra señal. No constituyen un diagnóstico ni evaluación docente.
- Racha y calendario de actividad por materia, sin puntos ni clasificación entre alumnos. Cuenta días con ejercicios, tarjetas o sesiones revisadas de al menos dos minutos; repetir acciones en un día no multiplica la racha. Se distingue del dominio.
- **Mis informes**: resumen semanal automático, fin de unidad y transición al siguiente curso. Conservan estados antes/después, confianza, ejercicios de apoyo, dificultades, recomendaciones y reflexión. El informe de unidad conserva su currículo; para cambiar de curso se eligen los conceptos y ayudas útiles que se quieren trasladar.
- Comparación de las respuestas originales que apoyan un informe, con enunciados, fechas, resultados, pistas y feedback. Las preguntas pueden ser distintas y se muestran completas para interpretarlas.
- Informes exportables a PDF local para leer/imprimir, CSV para hoja de cálculo y JSON con las evidencias originales seleccionadas. No se utiliza IA ni un servicio externo para generarlos.
- Exportación del historial completo en JSON y copias portables cifradas con contraseña; restauración y borrado de datos.
- Texto ampliado, contraste adicional y navegación por teclado.
- Ejemplo de una asignatura de redes que se crea solo cuando se solicita y empieza sin evidencias ficticias.

## Privacidad y almacenamiento

La aplicación almacena una base SQLite cifrada con AES-256-GCM en el directorio de datos del usuario. La clave se protege mediante el almacenamiento seguro de Electron, que en Windows utiliza la protección del sistema para la sesión del usuario. En Ajustes se muestra la ubicación concreta.

Los materiales importados se conservan como texto extraído; la app no modifica los documentos originales. El cifrado incluye el perfil, los textos de los materiales, las conversaciones y los intentos. Los pesos públicos del modelo no contienen el historial del alumno y no necesitan cifrado.

Los diagnósticos, percepciones, reflexiones, tareas, currículo, unidades, tarjetas, versiones, repasos, portfolio, sesiones, simulacros, rúbricas, entregas, análisis, observaciones, refuerzos, conexiones, proyectos compartidos, informes, metas, reflexiones de avisos y revisiones se incluyen en la misma base cifrada y en las copias portables. La versión 0.11 actualiza bases y copias anteriores sin inventar ejercicios ni resultados. Los ejercicios autónomos anteriores se incorporan al portfolio con su fecha e identificador originales; los informes semanales se derivan de la actividad registrada. Una copia 0.11 necesita esta versión o una posterior para restaurarse. La validación comprueba fuentes, intervalos de estudio, versiones originales, citas literales, relación entre un refuerzo y el cálculo original, seguimiento en otro día, ciclos de prerrequisitos, coherencia de las correcciones y trabajos compartidos, y estados, cifras, ayudas y referencias de cada informe antes de sustituir el historial.

Al cerrar, suspender o bloquear el ordenador, una sesión de estudio se pausa. Tras un cierre inesperado se recupera el último punto confirmado, guardado cada 15 segundos aproximadamente; el tiempo con la aplicación cerrada queda fuera de la sesión. Un simulacro tiene un plazo absoluto: cerrar la aplicación no lo pausa. Si vence mientras está cerrada, al abrirla se corrigen las respuestas confirmadas hasta entonces. El formulario indica cuándo una respuesta está guardada.

El proceso de renderizado tiene aislamiento de contexto, sandbox, permisos denegados y bloqueo de solicitudes de red. No se habilitan analíticas externas, envío de diagnósticos ni servicios de IA externos. El motor local se inicia con `--offline`, escucha solo en `127.0.0.1` y exige una clave aleatoria por ejecución. Los accesos de red del proceso principal incluyen la descarga del modelo iniciada por el alumno y las consultas de lectura a los cursos Moodle que conecte. La descarga revela metadatos normales de conexión al proveedor, sin enviar el historial educativo. Moodle recibe el token y las consultas necesarias para recuperar el curso; el conector no envía entregas ni cambia notas.

Las credenciales Moodle se cifran en un archivo separado y quedan fuera de los snapshots y las copias portables. La contraseña del aula se usa solo para obtener un token. Al restaurar una copia hay que reconectar cada curso. Desconectar borra el token y conserva la copia educativa; borrar la copia Moodle elimina también sus versiones, entregas, notas, recursos y tareas importados.

Las copias `.tutor` usan AES-256-GCM y una clave derivada con scrypt de una contraseña y una sal aleatoria. Son portables entre equipos. Una exportación `.json` es legible y la interfaz lo indica antes de guardarla.

Los PDF, CSV y JSON de informes también son legibles; la interfaz lo indica antes de elegir dónde guardarlos. Solo incluyen la asignatura y selección del informe. El JSON conserva los ejercicios originales que apoyan sus cifras/estimaciones y los eventos seleccionados; no añade conversaciones, materiales, otras materias ni credenciales. El PDF muestra los ejercicios que justifican las estimaciones y marca explícitamente las respuestas que superan 800 caracteres como extractos; las respuestas completas permanecen en la app y en el JSON. El CSV contiene estados, motivos y referencias y protege las celdas que podrían interpretarse como fórmulas.

El borrado de una asignatura elimina sus materiales, conceptos, ejercicios, conversaciones, currículo, unidades, tarjetas, portfolio, sesiones, simulacros, rúbricas, entregas, análisis, refuerzos, revisiones y eventos. El borrado general también reinicia las preferencias. Las copias exportadas y los archivos originales quedan bajo control del usuario. Al eliminar una versión de un material, se retiran sus fragmentos de las fuentes almacenadas, sus enlaces en unidades/sesiones/entregas y las tarjetas derivadas de esa versión, incluidos sus cambios y repasos. Las respuestas previas del tutor se conservan. Retirar una selección del portfolio no elimina el intento original ni su copia independiente enviada a una rúbrica; esa entrega tiene su propio borrado. Borrar una rúbrica elimina sus versiones, entregas y revisiones asociadas.

Borrar una asignatura también elimina sus conexiones y los proyectos compartidos en los que participó alguna de sus versiones, incluidas copias y revisiones. Conserva los trabajos originales de otras materias. Borrar un proyecto elimina sus copias y versiones sin borrar sus ejercicios, entregas o portfolio originales. Si se elimina una entrega o selección de portfolio utilizada en un proyecto, su copia se conserva como independiente y la interfaz indica que el origen ya no está disponible. Para retirar esa copia hay que borrar el proyecto correspondiente.

Borrar un informe retira toda su serie de versiones y conserva los ejercicios originales. Borrar una asignatura elimina también sus informes y preferencias. Si se elimina un análisis del que procedía una ayuda seleccionada, se retiran las series de informes que incluían esa ayuda. El borrado de una unidad o elemento curricular conserva la fotografía histórica del informe, con sus títulos y referencias del momento de creación.

## Mis metas y evolución

Una meta conserva su criterio personal y la selección de conceptos. Puedes elegir una fecha de inicio anterior para usar ejercicios ya registrados o programar el inicio futuro. La práctica cuenta días con intentos comprobados sin pistas, desde el inicio elegido; los errores también cuentan como práctica. Las autoevaluaciones se conservan para reflexión y no aumentan ese indicador. Considerar alcanzada una meta requiere una reflexión personal y no modifica las estimaciones. Editarla crea una versión en marcha, conservando la definición y reflexiones anteriores; borrarla elimina toda su serie sin borrar ejercicios.

Los avisos de dificultad requieren tres últimos intentos con error o pistas, al menos dos preguntas y dos días. Se considera cambio tras consolidación solo cuando esa estimación existía antes. Cuatro intentos recientes en varios días sin consolidación proponen comprobar autonomía. Más de 30 días sin ejercicio comprobado propone revisar el recuerdo; siete días sin actividad registrada propone retomar. El aviso de inactividad admite que se haya estudiado fuera de la app. Son reglas iniciales transparentes, pendientes de evaluar con alumnos reales.

La evolución reconstruye estados desde las fechas de los ejercicios disponibles actualmente. Una importación de historial antiguo puede cambiar esa reconstrucción; los informes guardados mantienen sus fotografías. Se muestra la zona horaria y se pueden abrir las fuentes. Borrar una materia elimina sus metas, reflexiones y revisiones de avisos. La racha cuenta días del calendario local; puede incluir registros personales y valoraciones de tarjetas, por lo que no demuestra dominio. El modo examen oculta todos estos datos y bloquea sus operaciones.

## Mis informes

Los resúmenes semanales están activados por defecto por asignatura. Con la app abierta se comprueba cada minuto si hay semanas cerradas de lunes a domingo con actividad registrada: ejercicios, tarjetas, sesiones revisadas, tareas, proyectos o refuerzos. Al volver a abrir, recupera las semanas pendientes con esas evidencias, sin inventar actividad en semanas vacías. Las tareas y valoraciones personales no se utilizan para afirmar dominio. Se puede desactivar la generación automática conservando lo ya guardado.

Cada informe es una fotografía inmutable del periodo y su zona horaria. Guarda los estados anterior y final, la confianza y los identificadores de los ejercicios que los apoyan. Una bajada asociada solo al tiempo transcurrido se presenta como necesidad de comprobar el recuerdo; no demuestra que se haya olvidado el contenido. Las nuevas evidencias no cambian un informe anterior: se prepara una nueva versión enlazada y se conservan las dos. El currículo de la unidad refleja lo disponible al preparar el informe, también cuando el periodo es anterior.

En **Cambio de curso**, el alumno indica el destino y selecciona los conceptos y reflexiones de refuerzo útiles. Se conserva ese contexto con ejercicios de apoyo, sin trasladar indiscriminadamente conversaciones y materiales. Los informes orientan el estudio y no constituyen calificaciones docentes. Si se incorpora actividad histórica de una semana que ya se procesó, se puede preparar un informe manual o una nueva versión; tampoco se vuelve a crear automáticamente una serie borrada de una semana ya procesada.

## Conectar Moodle

Crea o selecciona una asignatura y abre **Mi Moodle → Conectar un curso**. Introduce la dirección del aula y un token habilitado para servicios web. También puedes utilizar tu usuario y contraseña si el centro permite el servicio de la app móvil. La app muestra únicamente los cursos del usuario conectado y empieza con actualizaciones manuales. Las conexiones externas requieren HTTPS.

El centro debe habilitar REST y las funciones de lectura correspondientes; el permiso de descarga de archivos es independiente. El registro de cambios indica cuándo una categoría no está disponible y conserva la última copia al fallar una consulta. Los archivos de otros servidores no reciben el token; las redirecciones de descarga se rechazan. Los formatos no admitidos quedan como referencias. No se descarga automáticamente contenido de enlaces externos.

Las notas y las entregas en línea se guardan como información de Moodle. Las entregas con archivos, los intentos históricos anteriores a la conexión y otros LMS todavía necesitan ampliación. La compatibilidad real comprobada hasta ahora corresponde a Moodle 4.5.14+ con un alumno sintético y un servicio de lectura; los permisos del Moodle de cada centro pueden variar.

## Desarrollo

GitHub Actions ejecuta las pruebas y la compilación en Linux y Windows. Después prepara Moodle y los modelos locales, construye el instalador y comprueba los 17 recorridos empaquetados, los informes PDF y la instalación/desinstalación silenciosa en Windows. Los informes y las capturas sintéticas quedan disponibles como artefactos. El alcance y los límites se explican en [las pruebas de CI](docs/ci.md).

Requisitos del desarrollador: Node.js 24 LTS y npm. Estos requisitos no se trasladan al alumno.

```powershell
npm ci
node node_modules/electron/install.js
npm run prepare:runtime
./scripts/create-icon.ps1
npm run dev
```

La preparación del motor descarga una versión fija de llama.cpp desde su repositorio oficial, verifica el SHA-256 y conserva su licencia. También prepara las DLL de Visual C++ de 64 bits desde el redistribuible oficial de Microsoft, verificando su firma. La distribución de estos componentes está sujeta a los términos de Microsoft para desarrolladores de Visual Studio; debe revisarse antes de distribuir públicamente el instalador. La interfaz usa React y TypeScript; el escritorio usa Electron. SQLite se ejecuta mediante sql.js para evitar compilación de módulos nativos en la instalación.

```powershell
npm test
npm run build
npm run test:desktop
npm run test:planning
npm run test:education
npm run test:study
npm run test:assessment
npm run test:rubrics
npm run test:rubrics:ai
npm run test:pedagogy
npm run test:pedagogy:ai
npm run test:connections
npm run test:reports
npm run test:goals
npm run prepare:pdf-check
npm run test:reports:pdf
node scripts/test-ai.mjs
npm run dist
node scripts/smoke-desktop.mjs --packaged
node scripts/smoke-planning.mjs --packaged
node scripts/smoke-education.mjs --packaged
node scripts/smoke-study.mjs --packaged
node scripts/smoke-assessment.mjs --packaged
node scripts/smoke-rubrics.mjs --packaged
node scripts/smoke-rubrics-ai.mjs --packaged
node scripts/smoke-ai-desktop.mjs --packaged
npm run test:ocr
node scripts/smoke-ocr.mjs --packaged
npm run test:materials
node scripts/smoke-materials.mjs --packaged
npm run test:release
```

`test-ai.mjs` descarga el modelo de prueba en `.tools/ai-test/` si falta. Las pruebas de escritorio utilizan perfiles independientes dentro de `.tools/` y producen capturas en `test-results/`. No escriben en el perfil normal del alumno. La app instalada puede ejecutarse desde `release/win-unpacked/Tutor Local.exe` para revisión previa al instalador.

La comprobación de PDF prepara herramientas portables solo para desarrollo (Poppler, Python embebido y pypdf), con descargas verificadas. Comprueba texto, selección de evidencias, tamaño A4 y numeración; renderiza todas las páginas en `tmp/pdfs/` para inspección visual. El PDF de la app utiliza el motor incluido de Electron: el alumno no necesita estas herramientas. `test:release` comprueba la aplicación empaquetada, incluidos los informes; la revisión visual de las páginas se registra por separado.

## Límites y siguientes etapas

La confianza es una regla inicial transparente, todavía sin calibración pedagógica con alumnos reales. El diagnóstico solo incluye conceptos con preguntas en el banco, hasta 12 conceptos; el resto se identifica como pendiente de comprobar. Dos preguntas por bloque aportan una estimación de confianza baja. La consolidación requiere aciertos sin pistas, varias preguntas diferentes y distintos días.

Los intervalos de repaso de conceptos son una regla inicial de 1, 3, 7, 14 y 30 días. Los aciertos sin pistas en un mismo día cuentan como un solo día para ampliar el intervalo. Un error o una pista reinicia el intervalo a un día; las autoevaluaciones no lo amplían. Las tarjetas tienen un calendario propio: «Otra vez» mantiene el repaso en el día, «Me costó» propone el siguiente y las valoraciones positivas amplían los intervalos cuando proceden de días diferentes. «Lo recordaba» y «Muy fácil» conservan etiquetas distintas y usan el mismo intervalo inicial. Una fecha vencida propone comprobar el recuerdo y no demuestra olvido. Estas reglas deben evaluarse con alumnos reales; no constituyen una medición psicométrica.

El banco comprobado es pequeño; el tutor puede proponer otros ejercicios, pero sus respuestas no se califican automáticamente. La recuperación combina palabras y embeddings locales; sus coincidencias son aproximadas y deben contrastarse con las fuentes. El modelo ligero requiere evaluar la calidad de sus explicaciones por asignatura y por equipo. Las tareas pueden introducirse manualmente o recuperarse desde un curso Moodle conectado. Las recomendaciones se recalculan desde el historial, sin sobrescribir los intentos anteriores.

La generación de tarjetas desde materiales propone recordar fragmentos; no interpreta semánticamente cada documento ni valida su rigor. El portfolio conserva texto y enlaces a intentos; todavía faltan adjuntos y una visualización más amplia del progreso. El currículo y las rúbricas se introducen manualmente, sin importador normativo o de formatos externos automático.

La revisión automática por rúbrica admite un contexto de hasta 6.000 caracteres por consulta, contando instrucciones, enunciado, descriptores cuando proceda y entrega completa. Primero comprueba si existe un intento, sin usar los niveles de la rúbrica para esa decisión. Si no hay intento o resulta incierto, los criterios quedan sin estimar. Después compara cada criterio con el trabajo original, que se presenta en fragmentos de hasta 600 caracteres conservando todo el texto; la IA selecciona sus referencias para citar y la aplicación recupera las citas del original. La generación exige de uno a tres fragmentos para proponer un nivel y permite dejarlo sin estimar cuando falta contenido suficiente. El feedback automático pide contrastar el nivel con el descriptor, sin generar afirmaciones libres sobre lo que escribió el alumno; la explicación detallada se conserva en su revisión personal. Se comprueba el límite de todas las consultas antes de iniciar y no se recorta el trabajo silenciosamente. Para entregas extensas está disponible la revisión personal; faltan el análisis automático en varios contextos y feedback específico fiable del modelo. La validación también deja sin estimar cualquier nivel sin fragmentos de apoyo. Comprobar citas literales garantiza su existencia, no la corrección pedagógica de la propuesta. Los niveles de la IA son sugerencias que deben contrastarse y no son calificaciones del profesor.

El análisis de observaciones en «Cómo aprendo» puede dividir el trabajo completo en varios contextos locales, con un máximo de 6.000 caracteres por consulta. Cada uno conserva el enunciado completo: si no cabe, se rechaza antes de iniciar el análisis y se ofrece revisión personal. La cancelación o un fallo no guardan resultados parciales. El modelo recibe las igualdades incorrectas comprobadas por la aplicación; la verificación real cubre un caso de cálculo y otro sin intento, sin demostrar calidad general en las seis habilidades. Las hipótesis necesitan revisión personal y no modifican las estimaciones de dominio. Los refuerzos abiertos conservan respuestas para reflexión, sin calificarlas automáticamente; la comprobación numérica o del banco no demuestra por sí sola consolidación ni independencia si se utilizaron pistas.

Los simulacros se limitan al banco inicial; todavía no reproducen el formato de un examen real aportado por el profesor ni admiten preguntas abiertas. El bloqueo se aplica dentro de esta aplicación, sin supervisar Windows ni impedir el uso de otras aplicaciones. Falta la configuración docente de evaluaciones y permisos antes de utilizarlo en un examen del centro.

Las coincidencias de nombres son propuestas para contrastar, no equivalencias comprobadas automáticamente. La transferencia requiere una conexión aceptada y evidencias del banco; se propone para conexiones directas, sin propagar dominio a través del grafo. Los proyectos sugieren comparar, aplicar y reflexionar; no ajustan su dificultad automáticamente ni aportan calificaciones docentes. Sus copias, las autoevaluaciones y las entregas con rúbrica no añaden ejercicios comprobados independientes. El grafo muestra hasta 80 nodos de estructura a la vez y pagina las evidencias de la selección; indica las cantidades y ofrece filtros para localizar el resto.

Siguen pendientes Open edX y Classroom, reconocimiento fiable de manuscritos y fórmulas, interpretación de imágenes/gráficos de presentaciones y transcripción automática de audio/vídeo, diagnóstico con un banco más amplio, análisis por rúbricas de entregas extensas, informes docentes y los demás puntos indicados en la matriz.

La importación de presentaciones extrae texto en el orden interno de los elementos; no reproduce el diseño, ni interpreta gráficos, SmartArt o imágenes. Los archivos PPT antiguos deben guardarse como PPTX. Para páginas guardadas y transcripciones se admite UTF-8 o UTF-16 con BOM. SRT/VTT utiliza subtítulos existentes: la transcripción automática de audio/vídeo sigue pendiente. El OCR local requiere una revisión del texto reconocido. La recuperación combina búsqueda textual y por significado en versiones actuales.

Entrega anterior 0.11 comprobada con 132 pruebas de dominio y 15 recorridos del ejecutable empaquetado, incluidos importación nueva, Moodle real e IA local. Los 48 archivos compilados y los tres de interfaz coinciden con el paquete. Se han revisado las siete páginas PDF y cinco vistas de materiales. El instalador supera la comprobación de integridad NSIS; el asistente en un Windows limpio sigue pendiente y el ejecutable continúa sin firma digital. Comprobante: `test-results/release-0.11.0-verification.json`. En esa entrega, la matriz registraba 27 implementados, 41 parciales y 12 pendientes.

La captura no usa servicios remotos. Los recursos OCR incluidos se preparan en desarrollo con `npm run prepare:ocr` (versión fija, SHA-256 y licencia); `prepare:runtime` y `dist` también los preparan. El archivo original no se copia íntegro: se conserva un JPEG reducido sin metadatos, hasta 2 MB por imagen y 24 MB en total. Se admiten 200 capturas y 2.000 revisiones. Borrar la imagen conserva los textos ya revisados; para borrar toda la información de la asignatura usa su eliminación completa. Las copias anteriores a esquema 12 siguen siendo legibles.

Entrega 0.12 comprobada con 147 pruebas de dominio y 16 recorridos del ejecutable empaquetado, incluidos OCR real local con los modelos incluidos, Moodle real e IA local. Los 59 archivos compilados y los tres de interfaz coinciden con el paquete; los recursos OCR coinciden con su manifiesto. Se han revisado las siete páginas PDF y nueve vistas de captura. El instalador supera la comprobación de integridad NSIS; el asistente en un Windows limpio sigue pendiente y el ejecutable continúa sin firma digital. Comprobante: `test-results/release-0.12.0-verification.json`. La matriz de los 80 puntos registra 27 implementados, 42 parciales y 11 pendientes; el objetivo completo continúa activo.

La búsqueda por significado ejecuta [Multilingual E5 small](https://huggingface.co/intfloat/multilingual-e5-small) (MIT, versión y SHA-256 fijos) con ONNX en CPU, dentro de un proceso aislado. El índice contiene huellas y vectores, nunca consultas ni texto en claro, y se cifra con la clave del historial. Es reconstruible y queda fuera de la copia portable. El borrado/restauración de fuentes retira el índice; las consultas en curso no pueden recuperarlo después de un borrado. Se usan fragmentos completos y ventanas de tokens solapadas, sin recorte silencioso. Un ámbito superior a 30.000 fragmentos exige acotar filtros y lo indica antes de buscar. Las similitudes no son probabilidades, notas ni confianza de dominio. La comprobación inicial usa consultas sintéticas en castellano, inglés y gallego: una consulta gallega ambigua devuelve varios temas, incluido el buscado, sin garantizar su primer puesto. Falta evaluación pedagógica y lingüística amplia.

Verificación de la entrega 0.13: TypeScript/Vite, 160 pruebas de dominio y 17 recorridos del ejecutable empaquetado superados, incluidos OCR, búsqueda con ONNX real, Moodle real, conversación con Qwen real y rúbricas/observaciones con IA local. Los 69 archivos compilados y los tres archivos de interfaz coinciden con el paquete; se verifican los recursos OCR/E5, las DLL Windows x64 y el runtime VC incluido. Se han inspeccionado las siete páginas PDF, nueve vistas de captura y cinco de búsqueda/originales/evidencias. El instalador real se instaló silenciosamente en una carpeta aislada de este equipo, creó accesos directos, arrancó la app y ejecutó el modelo de búsqueda incluido; su desinstalación retiró la app y conservó el historial de pruebas. No es una prueba del asistente interactivo ni de un Windows limpio. Instalador: `release/Tutor-Local-0.13.0-Instalador.exe`, 242.471.420 bytes, SHA-256 `b4c045e6d57880fde68e461f6a888285be7523c3f03004608986f0592c9f428a`; contenido NSIS comprobado con 7-Zip. Sigue sin firma de código. Comprobantes: `test-results/release-0.13.0-verification.json`, `installer-0.13.0-verification.json`, `packaged-semantic-verification.json` y `packaged-semantic-ui-qa.json`. La matriz conserva 80 requisitos: 27 implementados, 43 parciales y 10 pendientes; el objetivo completo sigue pendiente de finalizar.
