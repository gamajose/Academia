from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import os
import json
from urllib import request, error

PORT = int(os.environ.get('PORT', '8084'))
API_BASE_URL = os.environ.get('API_BASE_URL', 'http://127.0.0.1:3004').rstrip('/')
ROOT = Path(__file__).resolve().parent
UPLOAD_ROOT = Path(os.environ.get('EDITOR_UPLOAD_DIR', str(ROOT / 'uploads'))).resolve()
PUBLIC_HTML = {'', '/', 'index.html', 'plans.html', 'matricula-publica.html', 'payment-return.html', 'student-login.html', 'student-reset.html', 'student-confirm.html', 'home.html'}
STUDENT_HTML = {'student-portal.html'}
ADMIN_ROLES = {'owner', 'admin', 'staff'}
NO_CACHE_SUFFIXES = ('.html', '.js', '.css')


def cookie_value(cookie, name):
    prefix = f'{name}='
    for item in cookie.split(';'):
        part = item.strip()
        if part.startswith(prefix):
            return part[len(prefix):]
    return ''


def api_get(path, token):
    if not token:
        return None
    req = request.Request(
        f'{API_BASE_URL}{path}',
        headers={'Authorization': f'Bearer {token}', 'Content-Type': 'application/json'},
        method='GET'
    )
    try:
        with request.urlopen(req, timeout=4) as response:
            raw = response.read().decode('utf-8') or '{}'
            return json.loads(raw)
    except (error.HTTPError, error.URLError, TimeoutError, json.JSONDecodeError):
        return None


class SiteHandler(SimpleHTTPRequestHandler):
    def translate_path(self, path):
        name = path.split('?', 1)[0].split('#', 1)[0].lstrip('/') or 'index.html'
        if name == 'uploads' or name.startswith('uploads/'):
            relative = Path(name.removeprefix('uploads/'))
            candidate = (UPLOAD_ROOT / relative).resolve()
            if UPLOAD_ROOT not in candidate.parents and candidate != UPLOAD_ROOT:
                return str(UPLOAD_ROOT / '__missing__')
            return str(candidate)
        return str(ROOT / name)

    def end_headers(self):
        name = self.path.split('?', 1)[0].split('#', 1)[0].lower()
        if not name or name == '/' or name.endswith(NO_CACHE_SUFFIXES):
            self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0')
            self.send_header('Pragma', 'no-cache')
            self.send_header('Expires', '0')
        super().end_headers()

    def redirect(self, location):
        self.send_response(302)
        self.send_header('Location', location)
        self.end_headers()

    def authorized_for_html(self, name):
        if name in PUBLIC_HTML or not name.endswith('.html'):
            return True

        cookie = self.headers.get('Cookie', '')
        admin_token = cookie_value(cookie, 'academiaAuth')
        student_token = cookie_value(cookie, 'academiaStudentAuth')

        if name in STUDENT_HTML:
            student = api_get('/api/student/me', student_token)
            return bool(student and student.get('id'))

        profile = api_get('/api/me', admin_token)
        return bool(profile and profile.get('role') in ADMIN_ROLES)

    def do_GET(self):
        name = self.path.split('?', 1)[0].split('#', 1)[0].lstrip('/') or 'index.html'
        if not self.authorized_for_html(name):
            if name in STUDENT_HTML:
                self.redirect('/student-login.html')
            else:
                self.redirect('/student-login.html')
            return
        return super().do_GET()


if __name__ == '__main__':
    os.chdir(ROOT)
    ThreadingHTTPServer(('0.0.0.0', PORT), SiteHandler).serve_forever()
