document.querySelectorAll('[data-dialog]').forEach(button => {
  button.addEventListener('click', () => document.getElementById(button.dataset.dialog)?.showModal());
});

document.querySelectorAll('[data-tab]').forEach(button => {
  button.addEventListener('click', () => {
    document.querySelectorAll('[data-tab]').forEach(tab => tab.setAttribute('aria-selected', String(tab === button)));
    document.querySelectorAll('[role="tabpanel"]').forEach(panel => panel.classList.toggle('hidden', panel.id !== button.dataset.tab));
  });
});

let toastTimer;
function showToast(message) {
  const toast = document.querySelector('.toast');
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 2400);
}
document.querySelectorAll('[data-toast]').forEach(button => {
  if (!button.closest('dialog')) button.addEventListener('click', () => showToast(button.dataset.toast));
});
document.querySelectorAll('dialog form').forEach(form => {
  form.addEventListener('submit', event => {
    const message = event.submitter?.dataset.toast;
    if (message) showToast(message);
  });
});
