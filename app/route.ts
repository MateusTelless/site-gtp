import shell from '../site-shell.html?raw';
export function GET(){return new Response(shell,{headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-cache','X-Content-Type-Options':'nosniff'}})}
