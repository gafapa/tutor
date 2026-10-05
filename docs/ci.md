# Pruebas en GitHub Actions

El workflow [Pruebas](https://github.com/gafapa/tutor/actions/workflows/tests.yml) se ejecuta al subir cambios a `main`, abrir/actualizar una pull request hacia `main`, subir una etiqueta `v*` o iniciarlo manualmente desde Actions. Usa Node.js 24, el lockfile y acciones oficiales fijadas por SHA.

## Dominio y compilación

En Ubuntu 24.04 y Windows Server 2025 se ejecutan todas las pruebas de `tests/*.test.ts` y `npm run build`: comprobación de TypeScript, compilación del backend e interfaz. El registro de resultados queda disponible en el artefacto correspondiente. La aplicación distribuida sigue dirigida a Windows; compilar y probar el dominio en Linux no demuestra compatibilidad del escritorio en Linux.

## Aplicación empaquetada en Windows

Tras superar ambos trabajos anteriores, un runner nuevo de Windows prepara las dependencias, construye el instalador y ejecuta la comprobación de la entrega:

- Integración REST contra Moodle 4.5.14+ real con PHP 8.3.35 y MariaDB 11.4.13, sin servicios instalados y solo con alumnos sintéticos.
- Inferencia real con Qwen local, además de OCR y embeddings con los modelos incluidos.
- Los 17 recorridos existentes: escritorio, materiales, OCR, búsqueda semántica, planificación, currículo, sesiones, simulacros, rúbricas, pedagogía, conexiones, informes, metas, Moodle, conversación local y las propuestas locales de rúbricas/observaciones.
- Integridad de la aplicación empaquetada y sus recursos, y texto/renderizado de todas las páginas PDF generadas por la fixture.
- Instalación silenciosa real, accesos directos, apertura del ejecutable instalado, búsqueda semántica y desinstalación conservando el perfil sintético.

Se guardan siete días los JSON, registros, capturas y PDF sintéticos. Tras superar todas las pruebas, el artefacto `instalador-windows` conserva durante 30 días el ejecutable, su SHA-256, las notas y un comprobante limitado a la versión, commit, resultados y límites de las pruebas. Se puede descargar desde la ejecución de Actions sin crear una release. La caché contiene únicamente modelos y descargas públicas verificables; no incluye perfiles, bases de datos, tokens, claves ni configuración de Moodle. Los trabajos de pruebas tienen permisos de lectura del repositorio y no necesitan secretos del alumno ni claves de proveedores de IA.

Las dependencias de pruebas se descargan de sus fuentes oficiales. PHP y MariaDB se comprueban por SHA-256, y Moodle se fija al commit `1990fc9201b23e0b0c8fdc44d537840a85d73503`. Los preparadores existentes verifican los demás modelos y herramientas. Las pruebas de IA necesitan descargar aproximadamente 1,12 GB para Qwen la primera vez.

## Publicación de versiones

Para publicar una nueva versión, actualiza `package.json` y el lockfile, confirma los cambios y sube una etiqueta que coincida exactamente, por ejemplo `v0.14.0`. Las etiquetas de versiones estables usan el formato `vMAYOR.MENOR.PARCHE`.

```powershell
git tag -a v0.14.0 -m "Tutor Local 0.14.0"
git push origin v0.14.0
```

GitHub construye el instalador en Windows y repite la batería completa. Solo después de superar dominio, compilación, Moodle, IA y las pruebas del instalador, un trabajo independiente descarga ese mismo artefacto, vuelve a comprobar el SHA-256 y el commit, sube los tres adjuntos a un borrador y publica la release. Este último trabajo tiene `contents: write` con el token automático de GitHub; no requiere un secreto personal y no se ejecuta en pull requests. Las versiones ya publicadas no se sobrescriben. Si falla la subida, puede quedar un borrador pendiente de revisión antes de reintentar.

El instalador se publica sin firma de código, como compilación en desarrollo. La generación en GitHub no cambia el almacenamiento local de los datos del alumno ni añade actualizaciones automáticas a la app. Los términos de los componentes redistribuidos siguen siendo aplicables.

## Límites de la automatización

Estas comprobaciones no sustituyen la revisión visual humana de las páginas y capturas, la validación pedagógica con alumnos reales, la prueba de manuscritos reales o el asistente interactivo del instalador en un Windows de usuario. El runner de CI es una imagen de Windows con herramientas preinstaladas. Los comprobantes conservan esos límites y no declaran completos los 80 requisitos.
