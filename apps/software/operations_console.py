#!/usr/bin/env python3
"""Console operacional da academia.

Usa apenas a biblioteca padrao do Python/Tkinter. Recursos:
- login por usuario da equipe;
- monitor de acessos em tempo real;
- status online/offline de leitores;
- busca rapida de aluno;
- exibicao da foto quando houver URL publica;
- abertura manual auditada;
- fila local de comandos durante indisponibilidade;
- indicador de conexao e atualizacao automatica.
"""

from __future__ import annotations

import json
import os
import queue
import threading
import time
import tkinter as tk
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass
from pathlib import Path
from tkinter import messagebox, ttk
from typing import Any, Callable

APP_DIR = Path.home() / ".academia-operations"
CONFIG_FILE = APP_DIR / "config.json"
QUEUE_FILE = APP_DIR / "pending-commands.json"


@dataclass
class Session:
    base_url: str
    token: str
    role: str
    user_name: str


class ApiError(RuntimeError):
    pass


class ApiClient:
    def __init__(self, base_url: str, token: str | None = None) -> None:
        self.base_url = base_url.rstrip("/")
        self.token = token

    def request(self, method: str, path: str, payload: dict[str, Any] | None = None, timeout: int = 10) -> dict[str, Any]:
        body = None if payload is None else json.dumps(payload).encode("utf-8")
        headers = {"Content-Type": "application/json", "Accept": "application/json"}
        if self.token:
            headers["Authorization"] = f"Bearer {self.token}"
        request = urllib.request.Request(f"{self.base_url}{path}", data=body, headers=headers, method=method)
        try:
            with urllib.request.urlopen(request, timeout=timeout) as response:
                raw = response.read().decode("utf-8")
                return json.loads(raw or "{}")
        except urllib.error.HTTPError as error:
            try:
                detail = json.loads(error.read().decode("utf-8"))
                message = detail.get("error") or detail.get("message") or str(error)
            except Exception:
                message = str(error)
            raise ApiError(message) from error
        except (urllib.error.URLError, TimeoutError) as error:
            raise ApiError(f"servidor_indisponivel: {error}") from error


class OperationsConsole(tk.Tk):
    def __init__(self) -> None:
        super().__init__()
        self.title("Academia Platform - Operacao")
        self.geometry("1180x720")
        self.minsize(980, 620)
        self.session: Session | None = None
        self.api: ApiClient | None = None
        self.worker_results: queue.Queue[tuple[Callable[..., None], tuple[Any, ...]]] = queue.Queue()
        self.stop_event = threading.Event()
        self.devices: list[dict[str, Any]] = []
        self.members: dict[str, dict[str, Any]] = {}
        APP_DIR.mkdir(parents=True, exist_ok=True)
        self.protocol("WM_DELETE_WINDOW", self.close)
        self.after(100, self.process_worker_results)
        self.show_login()

    def clear(self) -> None:
        for child in self.winfo_children():
            child.destroy()

    def config_data(self) -> dict[str, Any]:
        try:
            return json.loads(CONFIG_FILE.read_text(encoding="utf-8"))
        except Exception:
            return {}

    def save_config(self, base_url: str, email: str) -> None:
        CONFIG_FILE.write_text(json.dumps({"base_url": base_url, "email": email}, indent=2), encoding="utf-8")

    def show_login(self) -> None:
        self.clear()
        config = self.config_data()
        frame = ttk.Frame(self, padding=32)
        frame.pack(expand=True)
        ttk.Label(frame, text="Console operacional", font=("Arial", 24, "bold")).grid(row=0, column=0, columnspan=2, pady=(0, 20))
        ttk.Label(frame, text="URL da API").grid(row=1, column=0, sticky="w")
        api_entry = ttk.Entry(frame, width=48)
        api_entry.insert(0, config.get("base_url", "http://localhost:3004"))
        api_entry.grid(row=2, column=0, columnspan=2, sticky="ew", pady=(0, 10))
        ttk.Label(frame, text="E-mail").grid(row=3, column=0, sticky="w")
        email_entry = ttk.Entry(frame, width=48)
        email_entry.insert(0, config.get("email", ""))
        email_entry.grid(row=4, column=0, columnspan=2, sticky="ew", pady=(0, 10))
        ttk.Label(frame, text="Senha").grid(row=5, column=0, sticky="w")
        password_entry = ttk.Entry(frame, show="*", width=48)
        password_entry.grid(row=6, column=0, columnspan=2, sticky="ew", pady=(0, 14))
        status = ttk.Label(frame, text="")
        status.grid(row=8, column=0, columnspan=2, pady=8)

        def login() -> None:
            status.configure(text="Conectando...")
            base_url = api_entry.get().strip().rstrip("/")
            email = email_entry.get().strip()
            password = password_entry.get()

            def work() -> None:
                try:
                    client = ApiClient(base_url)
                    result = client.request("POST", "/api/auth/login", {"email": email, "password": password})
                    user = result.get("user") or {}
                    role = str(user.get("role") or "")
                    if role not in {"owner", "admin", "staff", "operator"}:
                        raise ApiError("perfil_sem_acesso_operacional")
                    session = Session(base_url, str(result["token"]), role, str(user.get("name") or email))
                    self.worker_results.put((self.login_success, (session, email)))
                except Exception as error:
                    self.worker_results.put((status.configure, ("text", f"Falha: {error}")))

            threading.Thread(target=work, daemon=True).start()

        ttk.Button(frame, text="Entrar", command=login).grid(row=7, column=0, columnspan=2, sticky="ew")
        password_entry.bind("<Return>", lambda _event: login())

    def login_success(self, session: Session, email: str) -> None:
        self.session = session
        self.api = ApiClient(session.base_url, session.token)
        self.save_config(session.base_url, email)
        self.show_dashboard()
        self.refresh_live()
        self.after(5000, self.auto_refresh)
        self.replay_queue()

    def show_dashboard(self) -> None:
        self.clear()
        assert self.session is not None
        top = ttk.Frame(self, padding=10)
        top.pack(fill="x")
        ttk.Label(top, text="Academia Platform", font=("Arial", 18, "bold")).pack(side="left")
        ttk.Label(top, text=f"{self.session.user_name} · {self.session.role}").pack(side="left", padx=16)
        self.connection_label = ttk.Label(top, text="● conectando", foreground="#ca8a04")
        self.connection_label.pack(side="right", padx=10)
        ttk.Button(top, text="Atualizar", command=self.refresh_live).pack(side="right")
        ttk.Button(top, text="Sair", command=self.logout).pack(side="right", padx=6)

        search = ttk.LabelFrame(self, text="Pesquisa rapida de aluno", padding=10)
        search.pack(fill="x", padx=10, pady=(0, 8))
        self.search_entry = ttk.Entry(search)
        self.search_entry.pack(side="left", fill="x", expand=True)
        ttk.Button(search, text="Pesquisar", command=self.search_members).pack(side="left", padx=6)
        self.search_entry.bind("<Return>", lambda _event: self.search_members())

        main = ttk.Panedwindow(self, orient="horizontal")
        main.pack(fill="both", expand=True, padx=10, pady=(0, 10))
        left = ttk.Frame(main)
        right = ttk.Frame(main)
        main.add(left, weight=3)
        main.add(right, weight=2)

        devices_box = ttk.LabelFrame(left, text="Leitores e catracas", padding=8)
        devices_box.pack(fill="x", pady=(0, 8))
        self.devices_tree = ttk.Treeview(devices_box, columns=("status", "last"), show="headings", height=5)
        self.devices_tree.heading("status", text="Status")
        self.devices_tree.heading("last", text="Ultima comunicacao")
        self.devices_tree.pack(fill="x")

        access_box = ttk.LabelFrame(left, text="Entradas em tempo real", padding=8)
        access_box.pack(fill="both", expand=True)
        self.access_tree = ttk.Treeview(access_box, columns=("time", "member", "device", "result", "message"), show="headings")
        for column, title, width in (("time", "Horario", 120), ("member", "Aluno", 180), ("device", "Leitor", 140), ("result", "Resultado", 90), ("message", "Detalhe", 280)):
            self.access_tree.heading(column, text=title)
            self.access_tree.column(column, width=width, anchor="w")
        self.access_tree.pack(fill="both", expand=True)

        results_box = ttk.LabelFrame(right, text="Resultado da pesquisa", padding=8)
        results_box.pack(fill="both", expand=True)
        self.members_tree = ttk.Treeview(results_box, columns=("name", "status", "plan", "blocked"), show="headings")
        for column, title in (("name", "Aluno"), ("status", "Status"), ("plan", "Plano ate"), ("blocked", "Financeiro")):
            self.members_tree.heading(column, text=title)
        self.members_tree.pack(fill="both", expand=True)
        self.members_tree.bind("<<TreeviewSelect>>", lambda _event: self.select_member())

        self.member_detail = ttk.Label(results_box, text="Selecione um aluno.", justify="left")
        self.member_detail.pack(fill="x", pady=8)
        action = ttk.Frame(results_box)
        action.pack(fill="x")
        ttk.Label(action, text="Catraca").pack(side="left")
        self.device_combo = ttk.Combobox(action, state="readonly", width=24)
        self.device_combo.pack(side="left", padx=6)
        ttk.Button(action, text="Abrir manualmente", command=self.manual_unlock).pack(side="left")

        footer = ttk.Frame(self, padding=(10, 0, 10, 8))
        footer.pack(fill="x")
        self.queue_label = ttk.Label(footer, text="Fila local: 0")
        self.queue_label.pack(side="left")
        self.status_label = ttk.Label(footer, text="")
        self.status_label.pack(side="right")

    def run_worker(self, function: Callable[[], Any], on_success: Callable[[Any], None], on_error: Callable[[Exception], None] | None = None) -> None:
        def work() -> None:
            try:
                result = function()
                self.worker_results.put((on_success, (result,)))
            except Exception as error:
                callback = on_error or self.show_error
                self.worker_results.put((callback, (error,)))

        threading.Thread(target=work, daemon=True).start()

    def process_worker_results(self) -> None:
        try:
            while True:
                callback, args = self.worker_results.get_nowait()
                try:
                    if len(args) == 2 and args[0] == "text" and hasattr(callback, "__call__"):
                        callback(**{args[0]: args[1]})
                    else:
                        callback(*args)
                except Exception:
                    pass
        except queue.Empty:
            pass
        if not self.stop_event.is_set():
            self.after(100, self.process_worker_results)

    def refresh_live(self) -> None:
        if not self.api:
            return
        self.run_worker(lambda: self.api.request("GET", "/api/operations/live"), self.render_live, self.connection_error)

    def render_live(self, data: dict[str, Any]) -> None:
        self.connection_label.configure(text="● online", foreground="#16a34a")
        self.status_label.configure(text=f"Atualizado {time.strftime('%H:%M:%S')}")
        self.devices = list(data.get("devices") or [])
        self.devices_tree.delete(*self.devices_tree.get_children())
        for device in self.devices:
            status = "Online" if device.get("online") else "Offline" if device.get("is_active") else "Desativada"
            self.devices_tree.insert("", "end", iid=str(device["id"]), values=(status, device.get("last_seen_at") or "-"))
        self.device_combo["values"] = [device.get("name") or device.get("code") for device in self.devices if device.get("is_active")]
        if self.device_combo["values"] and not self.device_combo.get():
            self.device_combo.current(0)

        self.access_tree.delete(*self.access_tree.get_children())
        for item in data.get("decisions") or []:
            result = "Liberado" if item.get("allowed") else "Bloqueado"
            self.access_tree.insert("", "end", values=(item.get("decided_at") or "-", item.get("member_name") or "-", item.get("device_name") or "-", result, item.get("message") or item.get("reason") or ""))
        self.update_queue_label()

    def connection_error(self, error: Exception) -> None:
        self.connection_label.configure(text="● offline", foreground="#dc2626")
        self.status_label.configure(text=str(error))
        self.update_queue_label()

    def search_members(self) -> None:
        if not self.api:
            return
        term = self.search_entry.get().strip()
        if len(term) < 2:
            return
        path = f"/api/operations/members?q={urllib.parse.quote(term)}"
        self.run_worker(lambda: self.api.request("GET", path), self.render_members)

    def render_members(self, data: dict[str, Any]) -> None:
        self.members_tree.delete(*self.members_tree.get_children())
        self.members.clear()
        for item in data.get("data") or []:
            member_id = str(item["id"])
            self.members[member_id] = item
            blocked = "Bloqueado" if item.get("financially_blocked") else "OK"
            self.members_tree.insert("", "end", iid=member_id, values=(item.get("name") or "-", item.get("status") or "-", item.get("ends_at") or "-", blocked))

    def selected_member(self) -> dict[str, Any] | None:
        selected = self.members_tree.selection()
        return self.members.get(selected[0]) if selected else None

    def select_member(self) -> None:
        member = self.selected_member()
        if not member:
            return
        text = f"{member.get('name')}\nTelefone: {member.get('phone') or '-'}\nE-mail: {member.get('email') or '-'}\nStatus: {member.get('status')}\nPlano ate: {member.get('ends_at') or '-'}"
        if member.get("financially_blocked"):
            text += "\nATENCAO: acesso bloqueado por pendencia financeira."
        self.member_detail.configure(text=text)

    def manual_unlock(self) -> None:
        member = self.selected_member()
        if not member:
            messagebox.showwarning("Aluno", "Selecione um aluno.")
            return
        active_devices = [device for device in self.devices if device.get("is_active")]
        index = self.device_combo.current()
        if index < 0 or index >= len(active_devices):
            messagebox.showwarning("Catraca", "Selecione uma catraca ativa.")
            return
        reason = "Abertura manual pela recepcao"
        if not messagebox.askyesno("Confirmar", f"Abrir {active_devices[index].get('name')} para {member.get('name')}?\nA acao sera auditada."):
            return
        payload = {"device_id": active_devices[index]["id"], "member_id": member["id"], "reason": reason}

        def send() -> dict[str, Any]:
            assert self.api is not None
            return self.api.request("POST", "/api/operations/manual-unlock", payload)

        def success(_result: dict[str, Any]) -> None:
            messagebox.showinfo("Catraca", "Comando de abertura enviado.")
            self.refresh_live()

        def failure(error: Exception) -> None:
            if "servidor_indisponivel" in str(error):
                self.enqueue(payload)
                messagebox.showwarning("Sem conexao", "O comando foi colocado na fila local. Ele so sera enviado quando a conexao voltar e ainda exigira confirmacao operacional.")
            else:
                self.show_error(error)

        self.run_worker(send, success, failure)

    def queue_data(self) -> list[dict[str, Any]]:
        try:
            return json.loads(QUEUE_FILE.read_text(encoding="utf-8"))
        except Exception:
            return []

    def enqueue(self, payload: dict[str, Any]) -> None:
        items = self.queue_data()
        items.append({"payload": payload, "created_at": time.time(), "status": "pending_confirmation"})
        QUEUE_FILE.write_text(json.dumps(items, indent=2), encoding="utf-8")
        self.update_queue_label()

    def replay_queue(self) -> None:
        items = self.queue_data()
        if not items or not self.api:
            return
        valid = [item for item in items if time.time() - float(item.get("created_at", 0)) < 300]
        expired = len(items) - len(valid)
        QUEUE_FILE.write_text(json.dumps(valid, indent=2), encoding="utf-8")
        if expired:
            messagebox.showinfo("Fila local", f"{expired} comando(s) expirado(s) foram descartados por seguranca.")
        if valid and messagebox.askyesno("Fila local", f"Existem {len(valid)} comando(s) pendente(s). Revisar e enviar agora?"):
            self.send_queue(valid)
        self.update_queue_label()

    def send_queue(self, items: list[dict[str, Any]]) -> None:
        if not self.api:
            return

        def work() -> None:
            remaining: list[dict[str, Any]] = []
            for item in items:
                try:
                    self.api.request("POST", "/api/operations/manual-unlock", item["payload"])
                except Exception:
                    remaining.append(item)
            QUEUE_FILE.write_text(json.dumps(remaining, indent=2), encoding="utf-8")
            self.worker_results.put((self.queue_sent, (len(items) - len(remaining), len(remaining))))

        threading.Thread(target=work, daemon=True).start()

    def queue_sent(self, sent: int, remaining: int) -> None:
        messagebox.showinfo("Fila local", f"Enviados: {sent}. Pendentes: {remaining}.")
        self.update_queue_label()
        self.refresh_live()

    def update_queue_label(self) -> None:
        if hasattr(self, "queue_label"):
            self.queue_label.configure(text=f"Fila local: {len(self.queue_data())}")

    def auto_refresh(self) -> None:
        if self.stop_event.is_set() or not self.session:
            return
        self.refresh_live()
        self.after(5000, self.auto_refresh)

    def show_error(self, error: Exception) -> None:
        messagebox.showerror("Erro", str(error))

    def logout(self) -> None:
        self.session = None
        self.api = None
        self.show_login()

    def close(self) -> None:
        self.stop_event.set()
        self.destroy()


def main() -> None:
    app = OperationsConsole()
    app.mainloop()


if __name__ == "__main__":
    main()
