# Pruebas en GitHub Actions

El workflow [Pruebas](https://github.com/gafapa/tutor/actions/workflows/tests.yml) se ejecuta al subir cambios a `main`, abrir/actualizar una pull request hacia `main` o iniciarlo manualmente desde Actions. Usa Node.js 24, el lockfile y acciones oficiales fijadas por SHA.

## Dominio y compilación

En Ubuntu 24.04 y Windows Server 2025 se ejecutan todas las pruebas de `tests/*.test.ts` y `npm run build`: comprobación de TypeScript, compilación del backend e interfaz. El registro TAP queda disponible en el artefacto correspondiente. La aplicación distribuida sigue dirigida a Windows; compilar y probar el dominio en Linux no demuestra compatibilidad del escritorio en Linux.

## Aplicación empaquetada en Windows

Tras superar ambos trabajos anteriores, un runner nuevo de Windows prepara las dependencias, construye el instalador y ejecuta la comprobación de la entrega:

- Integración REST contra Moodle 4.5.14+ real con PHP 8.3.35 y MariaDB 11.4.13, sin servicios instalados y solo con alumnos sintéticos.
- Inferencia real con Qwen local, además de OCR y embeddings con los modelos incluidos.
- Los 17 recorridos existentes: escritorio, materiales, OCR, búsqueda semántica, planificación, currículo, sesiones, simulacros, rúbricas, pedagogía, conexiones, informes, metas, Moodle, conversación local y las propuestas locales de rúbricas/observaciones.
- Integridad de la aplicación empaquetada y sus recursos, y texto/renderizado de todas las páginas PDF generadas por la fixture.
- Instalación silenciosa real, accesos directos, apertura del ejecutable instalado, búsqueda semántica y desinstalación conservando el perfil sintético.

Se guardan siete días los JSON, registros, capturas y PDF sintéticos. La caché contiene únicamente modelos y descargas públicas verificables; no incluye perfiles, bases de datos, tokens, claves ni configuración de Moodle. El workflow tiene permisos de lectura del repositorio y no necesita secretos del alumno ni claves de proveedores de IA. No publica instaladores ni releases.

Las dependencias de pruebas se descargan de sus fuentes oficiales. PHP y MariaDB se comprueban por SHA-256, y Moodle se fija al commit `1990fc9201b23e0b0c8fdc44d537840a85d73503`. Los preparadores existentes verifican los demás modelos y herramientas. Las pruebas de IA necesitan descargar aproximadamente 1,12 GB para Qwen la primera vez.

## Límites de la automatización

Estas comprobaciones no sustituyen la revisión visual humana de las páginas y capturas, la validación pedagógica con alumnos reales, la prueba de manuscritos reales o el asistente interactivo del instalador en un Windows de usuario. El runner de CI es una imagen de Windows con herramientas preinstaladas. Los comprobantes conservan esos límites y no declaran completos los 80 requisitos.
