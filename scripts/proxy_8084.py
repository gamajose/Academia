import socket
import threading
import sys

LISTEN_HOST = '0.0.0.0'
LISTEN_PORT = 8084
TARGET_HOST = '192.168.3.200'
TARGET_PORT = 8084
BUFFER_SIZE = 65536


def forward(src, dst):
    try:
        while True:
            data = src.recv(BUFFER_SIZE)
            if not data:
                break
            dst.sendall(data)
    except Exception:
        pass
    finally:
        try:
            dst.shutdown(socket.SHUT_WR)
        except Exception:
            pass


def handle_client(client_sock):
    try:
        target_sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        target_sock.settimeout(10.0)
        target_sock.connect((TARGET_HOST, TARGET_PORT))
        target_sock.settimeout(None)

        t1 = threading.Thread(target=forward, args=(client_sock, target_sock), daemon=True)
        t2 = threading.Thread(target=forward, args=(target_sock, client_sock), daemon=True)
        t1.start()
        t2.start()
        t1.join()
        t2.join()
    except Exception as e:
        print(f"[!] Error forwarding connection: {e}", flush=True)
    finally:
        client_sock.close()
        try:
            target_sock.close()
        except Exception:
            pass


def main():
    server = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    server.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    server.bind((LISTEN_HOST, LISTEN_PORT))
    server.listen(128)
    print(f"[*] Proxy TCP ativo: ouvindo em {LISTEN_HOST}:{LISTEN_PORT} -> encaminhando para {TARGET_HOST}:{TARGET_PORT}", flush=True)

    try:
        while True:
            client, addr = server.accept()
            threading.Thread(target=handle_client, args=(client,), daemon=True).start()
    except KeyboardInterrupt:
        print("[*] Encerrando proxy...", flush=True)
    finally:
        server.close()


if __name__ == '__main__':
    main()
