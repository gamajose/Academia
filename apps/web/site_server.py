from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import os
import json
import re
from urllib import request, error

PORT = int(os.environ.get('PORT', '8084'))
API_BASE_URL = os.environ.get('API_BASE_URL', 'http://127.0.0.1:3004').rstrip('/')
ROOT = Path(__file__).resolve().parent
UPLOAD_ROOT = Path(os.environ.get('EDITOR_UPLOAD_DIR', str(ROOT / 'uploads'))).resolve()
PUBLIC_HTML = {'', '/', 'index.html', 'plans.html', 'matricula-publica.html', 'payment-return.html', 'student-login.html', 'student-register.html', 'student-reset.html', 'student-confirm.html', 'home.html'}
STUDENT_HTML = {'student-portal.html', 'visitor-portal.html'}
ADMIN_ROLES = {'owner', 'admin', 'staff'}
NO_CACHE_SUFFIXES = ('.html', '.js', '.css')
BUILD_VERSION = '20260713-0310'
LEGACY_REDIRECTS = {
    'permissions.html': f'/users.html?v={BUILD_VERSION}',
    'student-accounts.html': f'/alunos.html?v={BUILD_VERSION}',
}
NAV_SCRIPT_PATTERN = re.compile(r'<script\s+src=["\']\./nav\.js(?:\?[^"\']*)?["\']></script>', re.IGNORECASE)


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
            if not student:
                student = api_get('/api/student/visitor/me', student_token)
            return bool(student and student.get('id'))

        profile = api_get('/api/me', admin_token)
        return bool(profile and profile.get('role') in ADMIN_ROLES)

    def serve_html(self, name):
        target = (ROOT / name).resolve()
        if ROOT not in target.parents or not target.is_file():
            self.send_error(404, 'Página não encontrada')
            return

        html = target.read_text(encoding='utf-8')
        versioned_nav = f'<script src="./nav.js?v={BUILD_VERSION}"></script>'
        html = NAV_SCRIPT_PATTERN.sub(versioned_nav, html)
        body = html.encode('utf-8')

        self.send_response(200)
        self.send_header('Content-Type', 'text/html; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def proxy_api(self):
        """Keep browser API calls on the same origin as the web application."""
        length = int(self.headers.get('Content-Length', '0') or 0)
        payload = self.rfile.read(length) if length else None
        headers = {}
        for header in ('Accept', 'Authorization', 'Content-Type', 'X-Access-Device-Key'):
            value = self.headers.get(header)
            if value:
                headers[header] = value

        upstream_request = request.Request(
            f'{API_BASE_URL}{self.path}',
            data=payload,
            headers=headers,
            method=self.command
        )
        try:
            with request.urlopen(upstream_request, timeout=20) as upstream:
                response_body = upstream.read()
                self.send_response(upstream.status)
                self.send_header('Content-Type', upstream.headers.get('Content-Type', 'application/json; charset=utf-8'))
                self.send_header('Content-Length', str(len(response_body)))
                self.end_headers()
                self.wfile.write(response_body)
        except error.HTTPError as upstream_error:
            response_body = upstream_error.read() or b'{"error":"api_error"}'
            self.send_response(upstream_error.code)
            self.send_header('Content-Type', upstream_error.headers.get('Content-Type', 'application/json; charset=utf-8'))
            self.send_header('Content-Length', str(len(response_body)))
            self.end_headers()
            self.wfile.write(response_body)
        except (error.URLError, TimeoutError, OSError):
            response_body = b'{"error":"api_indisponivel"}'
            self.send_response(502)
            self.send_header('Content-Type', 'application/json; charset=utf-8')
            self.send_header('Content-Length', str(len(response_body)))
            self.end_headers()
            self.wfile.write(response_body)

    def do_GET(self):
        if self.path.split('?', 1)[0].startswith('/api/'):
            return self.proxy_api()

        name = self.path.split('?', 1)[0].split('#', 1)[0].lstrip('/') or 'index.html'

        if name in LEGACY_REDIRECTS:
            self.redirect(LEGACY_REDIRECTS[name])
            return

        if not self.authorized_for_html(name):
            self.redirect('/student-login.html')
            return

        if name.endswith('.html'):
            return self.serve_html(name)

        return super().do_GET()

    def do_POST(self):
        if self.path.split('?', 1)[0].startswith('/api/'):
            return self.proxy_api()
        self.send_error(405, 'Método não permitido')

    def do_OPTIONS(self):
        if self.path.split('?', 1)[0].startswith('/api/'):
            return self.proxy_api()
        self.send_error(405, 'Método não permitido')


if __name__ == '__main__':
    os.chdir(ROOT)
    ThreadingHTTPServer(('0.0.0.0', PORT), SiteHandler).serve_forever()
