export function page(title: string, body: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)}</title>
  <style>
    :root { color-scheme: light; }
    body { margin: 0; font-family: "Segoe UI", sans-serif; background: #f4f7f6; color: #1c2b28; }
    main { max-width: 420px; margin: 48px auto; padding: 28px; background: #fff; border: 1px solid #d5e0dc; border-radius: 12px; }
    h1 { font-size: 1.4rem; margin: 0 0 8px; }
    p { line-height: 1.5; }
    label { display: block; font-weight: 600; margin: 16px 0 6px; }
    input { width: 100%; box-sizing: border-box; padding: 12px; border: 1px solid #b7c7c2; border-radius: 8px; font: inherit; }
    button, .link { display: inline-block; margin-top: 18px; background: #0e6b62; color: #fff; border: 0; border-radius: 8px; padding: 12px 16px; font: inherit; text-decoration: none; }
    .error { background: #fdecec; color: #8d1d1d; padding: 10px 12px; border-radius: 8px; }
    .muted { color: #52625e; }
    a { color: #0e6b62; }
  </style>
</head>
<body>
  <main>
    <p class="muted">ABAPro identity</p>
    <h1>${escapeHtml(title)}</h1>
    ${body}
  </main>
</body>
</html>`;
}

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => {
    const escaped: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
    return escaped[character] ?? character;
  });
}

export function loginFields(action: string, error = ''): string {
  return `${error ? `<p class="error" role="alert">${escapeHtml(error)}</p>` : ''}
    <form method="post" action="${escapeHtml(action)}">
      <label for="email">Email</label>
      <input id="email" name="email" type="email" autocomplete="username" required>
      <label for="password">Password</label>
      <input id="password" name="password" type="password" autocomplete="current-password" required>
      <button type="submit">Sign in</button>
    </form>
    <p class="muted">New to ABAPro? Create an identity below. This is separate from an organization.</p>
    <form method="post" action="${escapeHtml(action.replace(/\/login$/, '/register'))}">
      <label for="name">Name</label>
      <input id="name" name="name" type="text" autocomplete="name" required>
      <label for="register-email">Email</label>
      <input id="register-email" name="email" type="email" autocomplete="username" required>
      <label for="new-password">Password</label>
      <input id="new-password" name="password" type="password" autocomplete="new-password" required>
      <button type="submit">Create identity</button>
    </form>`;
}
