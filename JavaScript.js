const storageKey = 'lockcard-dados';
let currentAccount = null;
let refreshTimer = null;

document.addEventListener('DOMContentLoaded', () => {
  configurarAutenticacao();
  configurarNavegacao();
  configurarBuscas();
  configurarFormularios();
  configurarAcoesDeTabela();
  configurarPortas();
  configurarEdicaoModal();
  document.getElementById('exportarRelatorio')?.addEventListener('click', exportarRelatorio);
});

async function api(url, options = {}) {
  const response = await fetch(url, { headers: { 'Content-Type': 'application/json' }, ...options });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Não foi possível concluir a operação.');
  return data;
}

async function carregarDados() {
  try {
    const [users, cards, doors, accesses] = await Promise.all([
      api('/api/users'), api('/api/cards'), api('/api/doors'), api('/api/accesses')
    ]);
    renderizarUsuarios(users);
    renderizarCartoes(cards);
    renderizarPortas(doors, cards);
    renderizarAcessos(accesses);
  } catch (error) {
    console.error('Não foi possível carregar os dados:', error);
  }
}

async function carregarRelatorios() {
  try {
    atualizarGraficos(await api('/api/reports/summary'));
  } catch (error) {
    console.error('Não foi possível carregar os relatórios:', error);
  }
}

async function atualizarAplicacao() {
  await Promise.all([carregarDados(), carregarRelatorios()]);
}

function renderizarUsuarios(users) {
  const tbody = document.getElementById('tabelaUsuarios');
  if (!tbody) return;
  tbody.innerHTML = users.map(user => `<tr data-id="${user.id}"><td>${user.id}</td><td>${escapeHtml(user.name)}</td><td>${escapeHtml(user.email)}</td><td>${escapeHtml(user.phone)}</td><td><span class="status-badge status-${user.status}">${user.status === 'ativo' ? 'Ativo' : 'Inativo'}</span></td><td><button class="btn btn-sm btn-outline-primary-lockcard me-1" type="button"><i class="bi bi-pencil"></i></button><button class="btn btn-sm btn-outline-danger" type="button"><i class="bi bi-trash"></i></button></td></tr>`).join('');
  document.getElementById('totalUsuarios').textContent = users.length;
}

function renderizarCartoes(cards) {
  const tbody = document.getElementById('tabelaCartoes');
  if (!tbody) return;
  tbody.innerHTML = cards.map(card => `<tr data-id="${card.id}"><td>${escapeHtml(card.identifier)}</td><td>${escapeHtml(card.user_name)}</td><td>${escapeHtml(card.type)}</td><td>${escapeHtml(card.door_name || 'Sem porta')}</td><td>${new Date(card.created_at).toLocaleDateString('pt-BR')}</td><td><span class="status-badge status-${card.status}">${card.status === 'ativo' ? 'Ativo' : 'Inativo'}</span></td><td><button class="btn btn-sm btn-outline-primary-lockcard me-1" type="button"><i class="bi bi-pencil"></i></button><button class="btn btn-sm btn-outline-danger" type="button"><i class="bi bi-trash"></i></button></td></tr>`).join('');
  document.getElementById('totalCartoes').textContent = cards.length;
}

function renderizarPortas(doors, cards) {
  document.getElementById('totalPortas').textContent = doors.length;
  const grid = document.querySelector('#portas .row.g-4');
  if (grid) grid.innerHTML = doors.map(door => {
    const linkedCard = cards.find(card => card.door_id === door.id);
    return `<div class="col-md-4" data-id="${door.id}"><div class="card custom-card text-center"><div class="card-body"><div class="door-icon"><i class="bi bi-door-open"></i></div><h4 class="mt-3">${escapeHtml(door.name)}</h4><p class="text-muted">${escapeHtml(door.description)}</p><small class="text-muted d-block mb-3">${linkedCard ? `Cartão: ${escapeHtml(linkedCard.identifier)}` : 'Nenhum cartão vinculado'}</small><div class="d-flex justify-content-center gap-2"><button class="btn btn-sm btn-success btn-abrir-porta" type="button" data-door="${escapeHtml(door.name)}" data-card="${linkedCard ? escapeHtml(linkedCard.identifier) : ''}"><i class="bi bi-unlock"></i> Abrir</button><button class="btn btn-sm btn-outline-primary-lockcard" type="button"><i class="bi bi-pencil"></i> Editar</button></div></div></div></div>`;
  }).join('');
  const options = doors.map(door => `<option value="${door.id}">${escapeHtml(door.name)}</option>`).join('');
  const selects = [document.getElementById('cartaoPorta'), document.getElementById('edicaoPorta')];
  selects.forEach(select => { if (select) select.innerHTML = `<option value="">Selecione uma porta</option>${options}`; });
  configurarPortas(document);
}

function renderizarAcessos(accesses) {
  const tbody = document.getElementById('tabelaAcessos');
  const recent = document.getElementById('ultimosAcessos');
  if (tbody) tbody.innerHTML = accesses.map(access => `<tr><td>${formatarData(access.created_at)}</td><td>${escapeHtml(access.user_name)}</td><td>${escapeHtml(access.card)}</td><td>${escapeHtml(access.door)}</td><td>${escapeHtml(access.type)}</td><td><span class="badge ${access.status === 'Permitido' ? 'bg-success' : 'bg-danger'}">${escapeHtml(access.status)}</span></td></tr>`).join('');
  if (recent) recent.innerHTML = accesses.slice(0, 5).map(access => `<div class="list-group-item d-flex justify-content-between align-items-center"><div><strong>${escapeHtml(access.user_name)}</strong><br><small class="text-muted">${escapeHtml(access.door)} - ${formatarHora(access.created_at)}</small></div><span class="badge ${access.status === 'Permitido' ? 'bg-success' : 'bg-danger'}">${escapeHtml(access.status)}</span></div>`).join('');
  document.getElementById('totalAcessos').textContent = accesses.length;
}

function formatarData(value) { return new Date(value).toLocaleString('pt-BR'); }
function formatarHora(value) { return new Date(value).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }); }

function configurarAutenticacao() {
  const authScreen = document.getElementById('authScreen');
  const appHeader = document.getElementById('appHeader');
  const appMain = document.getElementById('appMain');
  const loginForm = document.getElementById('loginForm');
  const registerForm = document.getElementById('registerForm');
  const toggle = document.getElementById('toggleAuth');
  const showApp = account => {
    currentAccount = account;
    authScreen.hidden = true;
    appHeader.hidden = false;
    appMain.hidden = false;
    const admin = document.querySelector('.lockcard-header .btn-outline-light');
    if (admin && account) admin.innerHTML = `<i class="bi bi-person-circle"></i> ${escapeHtml(account.name)}`;
    atualizarAplicacao();
    if (!refreshTimer) refreshTimer = setInterval(atualizarAplicacao, 3000);
  };
  api('/api/auth/me').then(result => {
    if (result.account) showApp(result.account);
  }).catch(() => {});
  toggle.addEventListener('click', () => {
    const registering = registerForm.hidden;
    loginForm.hidden = registering;
    registerForm.hidden = !registering;
    toggle.textContent = registering ? 'Já tenho uma conta' : 'Ainda não tenho uma conta';
  });
  loginForm.addEventListener('submit', async event => {
    event.preventDefault();
    try {
      const account = await api('/api/auth/login', { method: 'POST', body: JSON.stringify(Object.fromEntries(new FormData(loginForm))) });
      showApp(account);
    } catch (error) {
      document.getElementById('loginError').textContent = error.message;
    }
  });
  registerForm.addEventListener('submit', async event => {
    event.preventDefault();
    try {
      const account = await api('/api/auth/register', { method: 'POST', body: JSON.stringify(Object.fromEntries(new FormData(registerForm))) });
      showApp(account);
    } catch (error) {
      document.getElementById('registerError').textContent = error.message;
    }
  });
}

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
  document.getElementById('formUsuario')?.addEventListener('submit', async event => {
    event.preventDefault();
    const form = event.currentTarget;
    const nome = form.querySelector('input[type="text"]').value.trim();
    const email = form.querySelector('input[type="email"]').value.trim();
    const telefone = form.querySelector('input[type="tel"]').value.trim();
    const status = form.querySelector('select').value;
    if (!nome || !email || !telefone) return;
    let saved;
    try { saved = await api('/api/users', { method: 'POST', body: JSON.stringify({ name: nome, email, phone: telefone, status }) }); }
    catch (error) { alert(error.message); return; }
    adicionarLinha('usuarios', saved.id, `<td>${escapeHtml(nome)}</td><td>${escapeHtml(email)}</td><td>${escapeHtml(telefone)}</td><td><span class="status-badge status-${status}">${status === 'ativo' ? 'Ativo' : 'Inativo'}</span></td>`);
    fecharModal(form);
  });

  document.getElementById('formCartao')?.addEventListener('submit', async event => {
    event.preventDefault();
    const form = event.currentTarget;
    const id = form.querySelector('#cartaoId').value.trim();
    const usuario = form.querySelector('#cartaoUsuario').value.trim();
    const tipo = form.querySelector('#cartaoTipo').value.toUpperCase();
    const portaId = form.querySelector('#cartaoPorta').value;
    if (!id || !usuario || !portaId) return;
    let saved;
    try { saved = await api('/api/cards', { method: 'POST', body: JSON.stringify({ identifier: id, userName: usuario, type: tipo, doorId: portaId }) }); }
    catch (error) { alert(error.message); return; }
    adicionarLinha('cartoes', saved.id, `<td>${escapeHtml(id)}</td><td>${escapeHtml(usuario)}</td><td>${tipo}</td><td>${new Date().toLocaleDateString('pt-BR')}</td><td><span class="status-badge status-ativo">Ativo</span></td>`);
    fecharModal(form);
  });

  document.getElementById('formPorta')?.addEventListener('submit', async event => {
    event.preventDefault();
    const form = event.currentTarget;
    const nome = form.querySelector('#portaNome').value.trim();
    const descricao = form.querySelector('#portaDescricao').value.trim();
    if (!nome || !descricao) return;
    let saved;
    try { saved = await api('/api/doors', { method: 'POST', body: JSON.stringify({ name: nome, description: descricao }) }); }
    catch (error) { alert(error.message); return; }
    const porta = document.createElement('div');
    porta.className = 'col-md-4';
    porta.dataset.id = saved.id;
    porta.innerHTML = `<div class="card custom-card text-center"><div class="card-body"><div class="door-icon"><i class="bi bi-door-open"></i></div><h4 class="mt-3">${escapeHtml(nome)}</h4><p class="text-muted">${escapeHtml(descricao)}</p><div class="d-flex justify-content-center gap-2"><button class="btn btn-sm btn-success btn-abrir-porta" type="button" data-door="${escapeHtml(nome)}"><i class="bi bi-unlock"></i> Abrir</button><button class="btn btn-sm btn-outline-primary-lockcard" type="button">Editar</button></div></div></div>`;
    document.querySelector('#portas .row.g-4')?.appendChild(porta);
    configurarPortas(porta);
    fecharModal(form);
  });
}

function configurarAcoesDeTabela() {
  document.querySelectorAll('tbody').forEach(tbody => tbody.addEventListener('click', async event => {
    const button = event.target.closest('button');
    const row = button?.closest('tr');
    if (!button || !row) return;
    const sectionId = row.closest('.content-section')?.id;
    const resource = { usuarios: 'users', cartoes: 'cards' }[sectionId];
    if (button.classList.contains('btn-outline-danger')) {
      if (confirm('Deseja excluir este registro?')) {
        if (resource && row.dataset.id) await api(`/api/${resource}/${row.dataset.id}`, { method: 'DELETE' });
        row.remove();
      }
      return;
    }
    if (button.classList.contains('btn-outline-primary-lockcard')) {
      abrirEdicao(resource, row.dataset.id, [...row.querySelectorAll('td')]);
    }
  }));
}

function configurarEdicaoModal() {
  document.getElementById('formEdicao')?.addEventListener('submit', async event => {
    event.preventDefault();
    const form = event.currentTarget;
    const type = form.querySelector('#edicaoTipo').value;
    const id = form.querySelector('#edicaoId').value;
    const payload = type === 'users'
      ? { name: form.querySelector('#edicaoNome').value.trim(), email: form.querySelector('#edicaoEmail').value.trim(), phone: form.querySelector('#edicaoTelefone').value.trim(), status: form.querySelector('#edicaoStatus').value }
      : type === 'cards'
        ? { identifier: form.querySelector('#edicaoIdentificador').value.trim(), userName: form.querySelector('#edicaoUsuario').value.trim(), type: form.querySelector('#edicaoTipoCartao').value, doorId: form.querySelector('#edicaoPorta').value, status: form.querySelector('#edicaoStatus').value }
        : { name: form.querySelector('#edicaoNome').value.trim(), description: form.querySelector('#edicaoDescricao').value.trim(), status: form.querySelector('#edicaoStatus').value };
    try {
      await api(`/api/${type}/${id}`, { method: 'PUT', body: JSON.stringify(payload) });
      bootstrap.Modal.getOrCreateInstance(document.getElementById('modalEdicao')).hide();
      await carregarDados();
    } catch (error) {
      document.getElementById('edicaoErro').textContent = error.message;
    }
  });
}

function abrirEdicao(type, id, cells) {
  if (!id) return;
  const form = document.getElementById('formEdicao');
  const groups = ['edicaoNomeGrupo', 'edicaoEmailGrupo', 'edicaoTelefoneGrupo', 'edicaoIdentificadorGrupo', 'edicaoUsuarioGrupo', 'edicaoTipoCartaoGrupo', 'edicaoPortaGrupo', 'edicaoDescricaoGrupo'];
  groups.forEach(group => { document.getElementById(group).hidden = true; });
  form.reset();
  form.querySelector('#edicaoId').value = id;
  form.querySelector('#edicaoTipo').value = type;
  document.getElementById('edicaoErro').textContent = '';
  if (type === 'users') {
    ['edicaoNomeGrupo', 'edicaoEmailGrupo', 'edicaoTelefoneGrupo'].forEach(group => { document.getElementById(group).hidden = false; });
    form.querySelector('#edicaoNome').value = cells[1].textContent.trim();
    form.querySelector('#edicaoEmail').value = cells[2].textContent.trim();
    form.querySelector('#edicaoTelefone').value = cells[3].textContent.trim();
    form.querySelector('#edicaoStatus').value = cells[4].textContent.trim().toLowerCase();
  } else if (type === 'cards') {
    ['edicaoIdentificadorGrupo', 'edicaoUsuarioGrupo', 'edicaoTipoCartaoGrupo', 'edicaoPortaGrupo'].forEach(group => { document.getElementById(group).hidden = false; });
    form.querySelector('#edicaoIdentificador').value = cells[0].textContent.trim();
    form.querySelector('#edicaoUsuario').value = cells[1].textContent.trim();
    form.querySelector('#edicaoTipoCartao').value = cells[2].textContent.trim();
    form.querySelector('#edicaoPorta').value = [...form.querySelector('#edicaoPorta').options].find(option => option.textContent.trim() === cells[3].textContent.trim())?.value || '';
    form.querySelector('#edicaoStatus').value = cells[5].textContent.trim().toLowerCase();
  } else {
    ['edicaoNomeGrupo', 'edicaoDescricaoGrupo'].forEach(group => { document.getElementById(group).hidden = false; });
    form.querySelector('#edicaoNome').value = cells[0].textContent.trim();
    form.querySelector('#edicaoDescricao').value = cells[1].textContent.trim();
    form.querySelector('#edicaoStatus').value = 'fechada';
  }
  bootstrap.Modal.getOrCreateInstance(document.getElementById('modalEdicao')).show();
}

function configurarPortas(root = document) {
  root.querySelectorAll('.btn-abrir-porta').forEach(button => {
    if (button.dataset.configurado) return;
    button.dataset.configurado = 'true';
    button.addEventListener('click', async () => {
      if (!button.dataset.card) {
        alert('Esta porta ainda não possui um cartão vinculado.');
        return;
      }
      const aberta = button.dataset.aberta === 'true';
      button.dataset.aberta = String(!aberta);
      button.classList.toggle('btn-success', aberta);
      button.classList.toggle('btn-danger', !aberta);
      button.innerHTML = `<i class="bi bi-${aberta ? 'unlock' : 'lock'}"></i> ${aberta ? 'Abrir' : 'Fechar'}`;
      try {
        await api('/api/accesses', { method: 'POST', body: JSON.stringify({ userName: currentAccount?.name || 'Usuário do sistema', card: button.dataset.card, door: button.dataset.door, type: 'Porta', status: aberta ? 'Fechado' : 'Permitido', source: 'site' }) });
        await carregarDados();
      } catch (error) {
        alert(error.message);
      }
    });
  });
  root.querySelectorAll('#portas .btn-outline-primary-lockcard').forEach(button => {
    if (button.dataset.edicaoConfigurada) return;
    button.dataset.edicaoConfigurada = 'true';
    button.addEventListener('click', async () => {
      const card = button.closest('.col-md-4');
      const id = card?.dataset.id;
      const title = card?.querySelector('h4');
      const description = card?.querySelector('.text-muted');
      if (!id || !title || !description) return;
      abrirEdicao('doors', id, [title, description]);
    });
  });
}

function adicionarLinha(sectionId, id, cells) {
  const tbody = document.querySelector(`#${sectionId} tbody`);
  if (!tbody) return;
  const row = document.createElement('tr');
  row.dataset.id = id;
  row.innerHTML = `<td>${id}</td>${cells}<td><button class="btn btn-sm btn-outline-primary-lockcard me-1" type="button"><i class="bi bi-pencil"></i></button><button class="btn btn-sm btn-outline-danger" type="button"><i class="bi bi-trash"></i></button></td>`;
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

const charts = {};

function atualizarGraficos(summary) {
  if (typeof Chart === 'undefined') return;
  Object.values(charts).forEach(chart => chart.destroy());
  const horas = Array.from({ length: 24 }, (_, hour) => `${String(hour).padStart(2, '0')}:00`);
  const acessosPorHora = Object.fromEntries(summary.byHour.map(item => [item.hour, item.total]));
  const criar = (id, type, labels, data, backgroundColor, options = {}) => {
    const canvas = document.getElementById(id);
    if (!canvas) return;
    charts[id] = new Chart(canvas, { type, data: { labels, datasets: [{ label: 'Acessos', data, backgroundColor, borderColor: backgroundColor, borderWidth: 2, tension: 0.35, fill: type === 'line' }] }, options: { responsive: true, maintainAspectRatio: true, plugins: { legend: { display: type === 'doughnut' } }, scales: type === 'doughnut' ? {} : { y: { beginAtZero: true }, x: { grid: { display: false } } }, ...options } });
  };
  criar('acessosChart', 'line', horas, horas.map((_, hour) => acessosPorHora[hour] || 0), '#00B5B8');
  criar('usuariosChart', 'bar', summary.byUser.map(item => item.name), summary.byUser.map(item => item.total), '#8B5CF6');
  criar('portasChart', 'doughnut', summary.byDoor.map(item => item.name), summary.byDoor.map(item => item.total), ['#00CED1', '#40E0D0', '#8B5CF6', '#A78BFA', '#C4B5FD']);
  criar('origemChart', 'doughnut', summary.bySource.map(item => item.source === 'app' ? 'App' : 'Site'), summary.bySource.map(item => item.total), ['#00B5B8', '#8B5CF6']);
}
