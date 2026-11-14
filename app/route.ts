import shell from '../site-shell.html?raw';
export function GET(){return new Response(shell,{headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-cache','X-Content-Type-Options':'nosniff','Strict-Transport-Security':'max-age=31536000; includeSubDomains','Content-Security-Policy':"frame-ancestors 'self'",'Referrer-Policy':'strict-origin-when-cross-origin'}})}
