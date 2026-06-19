import json
import tkinter as tk
from tkinter import messagebox
from urllib import request, error


class AcademiaCheckinApp:
    def __init__(self, root):
        self.root = root
        self.root.title('Academia Platform - Check-in')
        self.root.geometry('820x620')
        self.token = ''
        self.members = []

        self.api_url = tk.StringVar(value='http://localhost:3004')
        self.email = tk.StringVar()
        self.password = tk.StringVar()
        self.search = tk.StringVar()
        self.status = tk.StringVar(value='Informe os dados de acesso.')

        self.build_login()
        self.build_panel()
        self.panel_frame.pack_forget()

    def build_login(self):
        self.login_frame = tk.Frame(self.root, padx=20, pady=20)
        self.login_frame.pack(fill='both', expand=True)

        tk.Label(self.login_frame, text='Academia Platform', font=('Arial', 22, 'bold')).pack(anchor='w')
        tk.Label(self.login_frame, text='Software desktop de recepcao e check-in').pack(anchor='w', pady=(0, 18))

        tk.Label(self.login_frame, text='URL da API').pack(anchor='w')
        tk.Entry(self.login_frame, textvariable=self.api_url, width=60).pack(anchor='w', pady=(0, 10))

        tk.Label(self.login_frame, text='E-mail').pack(anchor='w')
        tk.Entry(self.login_frame, textvariable=self.email, width=60).pack(anchor='w', pady=(0, 10))

        tk.Label(self.login_frame, text='Senha').pack(anchor='w')
        tk.Entry(self.login_frame, textvariable=self.password, width=60, show='*').pack(anchor='w', pady=(0, 10))

        tk.Button(self.login_frame, text='Entrar', command=self.login, width=20).pack(anchor='w')
        tk.Label(self.login_frame, textvariable=self.status).pack(anchor='w', pady=(16, 0))

    def build_panel(self):
        self.panel_frame = tk.Frame(self.root, padx=20, pady=20)
        self.panel_frame.pack(fill='both', expand=True)

        top = tk.Frame(self.panel_frame)
        top.pack(fill='x')
        tk.Label(top, text='Check-in de alunos', font=('Arial', 20, 'bold')).pack(side='left')
        tk.Button(top, text='Atualizar', command=self.load_data).pack(side='right')

        tk.Entry(self.panel_frame, textvariable=self.search).pack(fill='x', pady=12)
        self.search.trace_add('write', lambda *_: self.render_members())

        content = tk.Frame(self.panel_frame)
        content.pack(fill='both', expand=True)

        left = tk.Frame(content)
        left.pack(side='left', fill='both', expand=True, padx=(0, 10))
        tk.Label(left, text='Alunos ativos').pack(anchor='w')
        self.members_list = tk.Listbox(left, height=20)
        self.members_list.pack(fill='both', expand=True)
        tk.Button(left, text='Registrar check-in', command=self.checkin_selected).pack(fill='x', pady=8)

        right = tk.Frame(content)
        right.pack(side='right', fill='both', expand=True, padx=(10, 0))
        tk.Label(right, text='Ultimos check-ins').pack(anchor='w')
        self.checkins_list = tk.Listbox(right, height=20)
        self.checkins_list.pack(fill='both', expand=True)

        tk.Label(self.panel_frame, textvariable=self.status).pack(anchor='w', pady=(12, 0))

    def api_request(self, path, method='GET', payload=None):
        data = None
        headers = {'Content-Type': 'application/json'}
        if self.token:
            headers['Authorization'] = f'Bearer {self.token}'
        if payload is not None:
            data = json.dumps(payload).encode('utf-8')
        req = request.Request(self.api_url.get().rstrip('/') + path, data=data, headers=headers, method=method)
        try:
            with request.urlopen(req, timeout=15) as response:
                raw = response.read().decode('utf-8')
                return json.loads(raw or '{}')
        except error.HTTPError as exc:
            raw = exc.read().decode('utf-8')
            try:
                detail = json.loads(raw).get('error', raw)
            except Exception:
                detail = raw
            raise RuntimeError(detail)

    def login(self):
        try:
            result = self.api_request('/api/auth/login', 'POST', {
                'email': self.email.get().strip(),
                'password': self.password.get(),
            })
            self.token = result['token']
            self.login_frame.pack_forget()
            self.panel_frame.pack(fill='both', expand=True)
            self.load_data()
        except Exception as exc:
            messagebox.showerror('Falha no login', str(exc))

    def load_data(self):
        try:
            members = self.api_request('/api/members').get('data', [])
            self.members = [m for m in members if m.get('status') == 'active']
            self.render_members()
            checkins = self.api_request('/api/checkins/recent').get('data', [])
            self.checkins_list.delete(0, tk.END)
            for row in checkins:
                self.checkins_list.insert(tk.END, f"{row.get('member_name')} - {row.get('checked_at')}")
            self.status.set('Dados atualizados.')
        except Exception as exc:
            self.status.set(f'Erro ao carregar: {exc}')

    def render_members(self):
        term = self.search.get().lower()
        self.members_list.delete(0, tk.END)
        for member in self.members:
            if term in member.get('name', '').lower():
                self.members_list.insert(tk.END, f"{member.get('name')} | {member.get('id')}")

    def checkin_selected(self):
        selected = self.members_list.curselection()
        if not selected:
            messagebox.showwarning('Check-in', 'Selecione um aluno.')
            return
        row = self.members_list.get(selected[0])
        member_id = row.split('|')[-1].strip()
        try:
            self.api_request('/api/checkins', 'POST', {'member_id': member_id, 'source': 'desktop'})
            self.status.set('Check-in registrado.')
            self.load_data()
        except Exception as exc:
            messagebox.showerror('Erro no check-in', str(exc))


if __name__ == '__main__':
    root = tk.Tk()
    app = AcademiaCheckinApp(root)
    root.mainloop()
