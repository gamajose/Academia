import json
import tkinter as tk
from tkinter import messagebox
from urllib import request, error


class AcademiaCheckinApp:
    def __init__(self, root):
        self.root = root
        self.root.title('Academia Platform - Operacao')
        self.root.geometry('980x700')
        self.token = ''
        self.members = []
        self.alerts = {}
        self.auto_sync_enabled = False

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
        tk.Label(self.login_frame, text='Software desktop de recepcao, check-in e alertas').pack(anchor='w', pady=(0, 18))

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
        tk.Label(top, text='Operacao da academia', font=('Arial', 20, 'bold')).pack(side='left')
        tk.Button(top, text='Atualizar tudo', command=self.load_data).pack(side='right')

        shortcuts = tk.Frame(self.panel_frame)
        shortcuts.pack(fill='x', pady=(10, 8))
        tk.Button(shortcuts, text='Check-ins', command=self.load_data).pack(side='left', padx=(0, 8))
        tk.Button(shortcuts, text='Alertas', command=self.load_alerts).pack(side='left', padx=(0, 8))
        tk.Button(shortcuts, text='Financeiro', command=self.load_finance_summary).pack(side='left', padx=(0, 8))
        tk.Button(shortcuts, text='Resumo de avaliacao', command=self.load_selected_assessment_summary).pack(side='left', padx=(0, 8))

        tk.Entry(self.panel_frame, textvariable=self.search).pack(fill='x', pady=8)
        self.search.trace_add('write', lambda *_: self.render_members())

        content = tk.Frame(self.panel_frame)
        content.pack(fill='both', expand=True)

        left = tk.Frame(content)
        left.pack(side='left', fill='both', expand=True, padx=(0, 10))
        tk.Label(left, text='Alunos ativos').pack(anchor='w')
        self.members_list = tk.Listbox(left, height=18)
        self.members_list.pack(fill='both', expand=True)
        tk.Button(left, text='Registrar check-in', command=self.checkin_selected).pack(fill='x', pady=8)

        center = tk.Frame(content)
        center.pack(side='left', fill='both', expand=True, padx=10)
        tk.Label(center, text='Ultimos check-ins').pack(anchor='w')
        self.checkins_list = tk.Listbox(center, height=18)
        self.checkins_list.pack(fill='both', expand=True)

        right = tk.Frame(content)
        right.pack(side='right', fill='both', expand=True, padx=(10, 0))
        tk.Label(right, text='Alertas / evolucao / financeiro').pack(anchor='w')
        self.alerts_list = tk.Listbox(right, height=18)
        self.alerts_list.pack(fill='both', expand=True)

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
            self.auto_sync_enabled = True
            self.load_data()
            self.schedule_sync()
        except Exception as exc:
            messagebox.showerror('Falha no login', str(exc))

    def schedule_sync(self):
        if self.auto_sync_enabled:
            self.load_data(silent=True)
            self.root.after(30000, self.schedule_sync)

    def load_data(self, silent=False):
        try:
            members = self.api_request('/api/members').get('data', [])
            self.members = [m for m in members if m.get('status') == 'active']
            self.render_members()
            checkins = self.api_request('/api/checkins/recent').get('data', [])
            self.checkins_list.delete(0, tk.END)
            for row in checkins:
                self.checkins_list.insert(tk.END, f"{row.get('member_name')} - {row.get('checked_at')}")
            self.load_alerts(silent=True)
            if not silent:
                self.status.set('Dados atualizados. Sincronizacao automatica a cada 30s.')
        except Exception as exc:
            if not silent:
                self.status.set(f'Erro ao carregar: {exc}')

    def load_alerts(self, silent=False):
        try:
            self.alerts = self.api_request('/api/alerts')
            self.alerts_list.delete(0, tk.END)
            summary = self.alerts.get('summary', {})
            self.alerts_list.insert(tk.END, f"Total de pendencias: {summary.get('total', 0)}")
            self.alerts_list.insert(tk.END, f"Pagamentos vencidos: {summary.get('overdue_payments', 0)}")
            self.alerts_list.insert(tk.END, f"Matriculas vencendo: {summary.get('memberships_due_soon', 0)}")
            self.alerts_list.insert(tk.END, f"Fichas para revisar: {summary.get('training_reviews_due', 0)}")
            self.alerts_list.insert(tk.END, f"Avaliacoes pendentes: {summary.get('assessments_due', 0)}")
            self.alerts_list.insert(tk.END, '--- Pagamentos vencidos ---')
            for row in self.alerts.get('overdue_payments', [])[:10]:
                amount = int(row.get('amount_cents') or 0) / 100
                self.alerts_list.insert(tk.END, f"{row.get('member_name')} - R$ {amount:.2f} - {row.get('days_overdue')} dias")
            self.alerts_list.insert(tk.END, '--- Fichas antigas ---')
            for row in self.alerts.get('training_reviews_due', [])[:10]:
                self.alerts_list.insert(tk.END, f"{row.get('member_name')} - {row.get('plan_name')} - {row.get('age_days')} dias")
            if not silent:
                self.status.set('Alertas atualizados.')
        except Exception as exc:
            if not silent:
                self.status.set(f'Erro ao carregar alertas: {exc}')

    def load_finance_summary(self):
        try:
            finance = self.api_request('/api/reports/finance-advanced')
            summary = finance.get('summary', {})
            self.alerts_list.delete(0, tk.END)
            self.alerts_list.insert(tk.END, f"A receber: R$ {int(summary.get('pending_amount_cents') or 0) / 100:.2f}")
            self.alerts_list.insert(tk.END, f"Recebido: R$ {int(summary.get('paid_amount_cents') or 0) / 100:.2f}")
            self.alerts_list.insert(tk.END, '--- Lancamentos ---')
            for row in finance.get('data', [])[:15]:
                amount = int(row.get('amount_cents') or 0) / 100
                self.alerts_list.insert(tk.END, f"{row.get('member_name')} - R$ {amount:.2f} - {row.get('status')} - {row.get('due_date')}")
            self.status.set('Resumo financeiro carregado.')
        except Exception as exc:
            self.status.set(f'Erro financeiro: {exc}')

    def render_members(self):
        term = self.search.get().lower()
        self.members_list.delete(0, tk.END)
        for member in self.members:
            if term in member.get('name', '').lower():
                self.members_list.insert(tk.END, f"{member.get('name')} | {member.get('id')}")

    def selected_member_id(self):
        selected = self.members_list.curselection()
        if not selected:
            return None
        row = self.members_list.get(selected[0])
        return row.split('|')[-1].strip()

    def checkin_selected(self):
        member_id = self.selected_member_id()
        if not member_id:
            messagebox.showwarning('Check-in', 'Selecione um aluno.')
            return
        try:
            self.api_request('/api/checkins', 'POST', {'member_id': member_id, 'source': 'desktop'})
            self.status.set('Check-in registrado.')
            self.load_data()
        except Exception as exc:
            messagebox.showerror('Erro no check-in', str(exc))

    def load_selected_assessment_summary(self):
        member_id = self.selected_member_id()
        if not member_id:
            messagebox.showwarning('Avaliacao', 'Selecione um aluno.')
            return
        try:
            summary = self.api_request(f'/api/assessments/summary?member_id={member_id}')
            current = summary.get('current')
            delta = summary.get('delta') or {}
            self.alerts_list.delete(0, tk.END)
            if not current:
                self.alerts_list.insert(tk.END, 'Nenhuma avaliacao encontrada para este aluno.')
            else:
                self.alerts_list.insert(tk.END, f"Data: {current.get('assessment_date')}")
                self.alerts_list.insert(tk.END, f"Peso: {current.get('weight_kg') or '-'} kg | variacao {delta.get('weight_kg') or '-'}")
                self.alerts_list.insert(tk.END, f"Gordura: {current.get('body_fat_percent') or '-'}% | variacao {delta.get('body_fat_percent') or '-'}")
                self.alerts_list.insert(tk.END, f"Cintura: {current.get('waist_cm') or '-'} cm | variacao {delta.get('waist_cm') or '-'}")
            self.status.set('Resumo de avaliacao carregado.')
        except Exception as exc:
            self.status.set(f'Erro no resumo: {exc}')


if __name__ == '__main__':
    root = tk.Tk()
    app = AcademiaCheckinApp(root)
    root.mainloop()
