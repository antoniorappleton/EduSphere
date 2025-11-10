// public/js/api.js
import { supabase } from './supabaseClient.js';

const FN_BASE = `${location.origin}/functions/v1`;

async function authHeader() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Sem sessão');
  return { 'Authorization': `Bearer ${session.access_token}`, 'Content-Type': 'application/json' };
}

// ---- Admin
export async function listExplicadores() {
  const headers = await authHeader();
  const res = await fetch(`${FN_BASE}/admin-users`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ action: 'list_explicadores', payload: {} })
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function createExplicador({ nome, email, password, apelido, contacto, max }) {
  const headers = await authHeader();
  const res = await fetch(`${FN_BASE}/admin-users`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ action: 'create_explicador', payload: { nome, email, password, apelido, contacto, max: Number(max||0) } })
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function updateExplicador(patch) {
  const headers = await authHeader();
  const res = await fetch(`${FN_BASE}/admin-users`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ action: 'update_explicador', payload: patch })
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function resetPassExplicador(id_explicador, new_password) {
  const headers = await authHeader();
  const res = await fetch(`${FN_BASE}/admin-users`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ action: 'reset_password', payload: { id_explicador, new_password } })
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function deleteExplicador(id_explicador) {
  const headers = await authHeader();
  const res = await fetch(`${FN_BASE}/admin-users`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ action: 'delete_explicador', payload: { id_explicador } })
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

// ---- Explicador
export async function createAluno({ nome, apelido, contacto, ano, email, password }) {
  const headers = await authHeader();
  const res = await fetch(`${FN_BASE}/expl-alunos`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ action: 'create_aluno', payload: { nome, apelido, contacto, ano: Number(ano||null), email, password } })
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}
