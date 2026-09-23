const storageKey = 'lockcard-dados';

document.addEventListener('DOMContentLoaded', () => {
  configurarNavegacao();
  configurarBuscas();
  configurarFormularios();
  configurarAcoesDeTabela();
  configurarPortas();
  document.getElementById('exportarRelatorio')?.addEventListener('click', exportarRelatorio);
  inicializarGraficos();
});

function configurarNavegacao() {
  const navLinks = document.querySelectorAll('.sidebar .nav-link');
  const headerLinks = document.querySelectorAll('.navbar-nav .nav-link');
  const abrirSecao = sectionId => {
    document.querySelectorAll('.content-section').forEach(section => {
      section.style.display = section.id === sectionId ? 'block' : 'none';
    });
    navLinks.forEach(link => link.classList.toggle('active', link.dataset.section === sectionId));
    headerLinks.forEach(link => link.classList.toggle('active', link.getAttribute('href') === `#${sectionId}`));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  navLinks.forEach(link => link.addEventListener('click', event => {
    event.preventDefault();
    abrirSecao(link.dataset.section);
  }));
  headerLinks.forEach(link => link.addEventListener('click', event => {
    event.preventDefault();
    abrirSecao(link.getAttribute('href').slice(1));
  }));
}

function configurarBuscas() {
  document.querySelectorAll('[data-search-table]').forEach(input => {
    input.addEventListener('input', () => {
      const section = document.getElementById(input.dataset.searchTable);
      const termo = input.value.trim().toLocaleLowerCase('pt-BR');
      section?.querySelectorAll('tbody tr').forEach(row => {
        row.hidden = !row.textContent.toLocaleLowerCase('pt-BR').includes(termo);
      });
    });
  });
}

function configurarFormularios() {
  document.getElementById('formUsuario')?.addEventListener('submit', event => {
    event.preventDefault();
    const form = event.currentTarget;
    const nome = form.querySelector('input[type="text"]').value.trim();
    const email = form.querySelector('input[type="email"]').value.trim();
    const telefone = form.querySelector('input[type="tel"]').value.trim();
    const status = form.querySelector('select').value;
    if (!nome || !email || !telefone) return;
    adicionarLinha('usuarios', `<td>${escapeHtml(nome)}</td><td>${escapeHtml(email)}</td><td>${escapeHtml(telefone)}</td><td><span class="status-badge status-${status}">${status === 'ativo' ? 'Ativo' : 'Inativo'}</span></td>`);
    fecharModal(form);
  });

  document.getElementById('formCartao')?.addEventListener('submit', event => {
    event.preventDefault();
    const form = event.currentTarget;
    const id = form.querySelector('#cartaoId').value.trim();
    const usuario = form.querySelector('#cartaoUsuario').value.trim();
    const tipo = form.querySelector('#cartaoTipo').value.toUpperCase();
    if (!id || !usuario) return;
    adicionarLinha('cartoes', `<td>${escapeHtml(id)}</td><td>${escapeHtml(usuario)}</td><td>${tipo}</td><td>${new Date().toLocaleDateString('pt-BR')}</td><td><span class="status-badge status-ativo">Ativo</span></td>`);
    fecharModal(form);
  });

  document.getElementById('formPorta')?.addEventListener('submit', event => {
    event.preventDefault();
    const form = event.currentTarget;
    const nome = form.querySelector('#portaNome').value.trim();
    const descricao = form.querySelector('#portaDescricao').value.trim();
    if (!nome || !descricao) return;
    const porta = document.createElement('div');
    porta.className = 'col-md-4';
    porta.innerHTML = `<div class="card custom-card text-center"><div class="card-body"><div class="door-icon"><i class="bi bi-door-open"></i></div><h4 class="mt-3">${escapeHtml(nome)}</h4><p class="text-muted">${escapeHtml(descricao)}</p><div class="d-flex justify-content-center gap-2"><button class="btn btn-sm btn-success btn-abrir-porta" type="button" data-door="${escapeHtml(nome)}"><i class="bi bi-unlock"></i> Abrir</button><button class="btn btn-sm btn-outline-primary-lockcard" type="button">Editar</button></div></div></div>`;
    document.querySelector('#portas .row.g-4')?.appendChild(porta);
    configurarPortas(porta);
    fecharModal(form);
  });
}

function configurarAcoesDeTabela() {
  document.querySelectorAll('tbody').forEach(tbody => tbody.addEventListener('click', event => {
    const button = event.target.closest('button');
    const row = button?.closest('tr');
    if (!button || !row) return;
    if (button.classList.contains('btn-outline-danger')) {
      if (confirm('Deseja excluir este registro?')) row.remove();
      return;
    }
    if (button.classList.contains('btn-outline-primary-lockcard')) {
      const cells = row.querySelectorAll('td');
      const novoNome = prompt('Digite o novo nome:', cells[1]?.textContent.trim());
      if (novoNome) cells[1].textContent = novoNome;
    }
  }));
}

function configurarPortas(root = document) {
  root.querySelectorAll('.btn-abrir-porta').forEach(button => {
    if (button.dataset.configurado) return;
    button.dataset.configurado = 'true';
    button.addEventListener('click', () => {
      const aberta = button.dataset.aberta === 'true';
      button.dataset.aberta = String(!aberta);
      button.classList.toggle('btn-success', aberta);
      button.classList.toggle('btn-danger', !aberta);
      button.innerHTML = `<i class="bi bi-${aberta ? 'unlock' : 'lock'}"></i> ${aberta ? 'Abrir' : 'Fechar'}`;
      console.log(`Porta ${button.dataset.door}: ${aberta ? 'fechada' : 'aberta'}`);
    });
  });
}

function adicionarLinha(sectionId, cells) {
  const tbody = document.querySelector(`#${sectionId} tbody`);
  if (!tbody) return;
  const row = document.createElement('tr');
  row.innerHTML = `<td>Novo</td>${cells}<td><button class="btn btn-sm btn-outline-primary-lockcard me-1" type="button"><i class="bi bi-pencil"></i></button><button class="btn btn-sm btn-outline-danger" type="button"><i class="bi bi-trash"></i></button></td>`;
  tbody.appendChild(row);
}

function fecharModal(form) {
  form.reset();
  const modal = form.closest('.modal');
  if (window.bootstrap && modal) bootstrap.Modal.getOrCreateInstance(modal).hide();
}

function exportarRelatorio() {
  const rows = [...document.querySelectorAll('#acessos table tr')];
  const csv = rows.map(row => [...row.querySelectorAll('th, td')].map(cell => `"${cell.textContent.trim().replaceAll('"', '""')}"`).join(';')).join('\n');
  const link = document.createElement('a');
  link.href = URL.createObjectURL(new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' }));
  link.download = 'relatorio-lockcard.csv';
  link.click();
  URL.revokeObjectURL(link.href);
}

function escapeHtml(value) {
  return value.replace(/[&<>'"]/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character]));
}

function inicializarGraficos() {
  if (typeof Chart === 'undefined') return;
  const configuracoes = [
    { id: 'acessosChart', type: 'line', labels: ['08:00', '09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00'], data: [8, 12, 18, 15, 22, 30, 38, 33, 28, 20], color: '#00B5B8' },
    { id: 'usuariosChart', type: 'bar', labels: ['Usuário 1', 'Usuário 2', 'Usuário 3', 'Usuário 4', 'Usuário 5'], data: [28, 35, 22, 18, 31], color: '#8B5CF6' },
    { id: 'portasChart', type: 'doughnut', labels: ['Porta Principal', 'Academia', 'Sala de Reunião', 'Estacionamento', 'Cofre'], data: [450, 280, 150, 367, 89], color: ['#00CED1', '#40E0D0', '#8B5CF6', '#A78BFA', '#C4B5FD'] }
  ];
  configuracoes.forEach(config => {
    const canvas = document.getElementById(config.id);
    if (!canvas) return;
    new Chart(canvas, { type: config.type, data: { labels: config.labels, datasets: [{ label: 'Acessos', data: config.data, backgroundColor: config.color, borderColor: config.color, borderWidth: 2, tension: 0.4, fill: config.type === 'line' }] }, options: { responsive: true, maintainAspectRatio: true, plugins: { legend: { display: config.type === 'doughnut' } }, scales: config.type === 'doughnut' ? {} : { y: { beginAtZero: true }, x: { grid: { display: false } } } } });
  });
}
