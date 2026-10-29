'use strict';
const form = document.getElementById('form');
const password = document.getElementById('password');
const confirmation = document.getElementById('confirmation');
const button = document.getElementById('submit');
const error = document.getElementById('error');
let existing = true;
window.portable.status().then(status => {
  existing = status.existing;
  document.getElementById('title').textContent = existing ? 'Vuelve a tu aprendizaje.' : 'Prepara tu espacio portable.';
  document.getElementById('description').textContent = existing ? 'Introduce tu contraseña para abrir el historial cifrado de esta carpeta.' : 'Elige una contraseña para proteger tus datos. Podrás abrir esta misma carpeta en otro equipo Windows.';
  document.getElementById('confirmation-row').hidden = existing;
  confirmation.required = !existing;
  password.autocomplete = existing ? 'current-password' : 'new-password';
  button.textContent = existing ? 'Abrir mi espacio' : 'Crear mi espacio portable';
  form.hidden = false; password.focus();
}).catch(() => { document.getElementById('description').textContent = 'No se pudo preparar la carpeta. Cierra la aplicación y vuelve a intentarlo.'; });
form.addEventListener('submit', async event => {
  event.preventDefault();
  error.textContent = '';
  if (!existing && password.value !== confirmation.value) { error.textContent = 'Las contraseñas no coinciden.'; confirmation.focus(); return; }
  button.disabled = true;
  try {
    const result = await window.portable.unlock({ password: password.value, ...(!existing ? { confirmation: confirmation.value } : {}) });
    if (!result.ok) { error.textContent = result.error; password.focus(); }
    else { password.value = ''; confirmation.value = ''; button.textContent = 'Abriendo…'; }
  } catch { error.textContent = 'No se pudo abrir la carpeta portable. Cierra la aplicación y vuelve a intentarlo.'; }
  finally { button.disabled = false; }
});
