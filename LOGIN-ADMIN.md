# Acesso administrativo — usuário e senha

Atualizado em 23/10/2026.

O modo `AUTH_PROVIDER=password` oferece login próprio em `/admin`. O usuário escolhe seu nome de acesso e sua senha; o e-mail de contato inicial é mateustelles2011@hotmail.com. Não existe cadastro público de administradores. Não envie senhas nesta conversa.

## Primeiro acesso

1. Na configuração privada da hospedagem, definir `AUTH_PROVIDER=password`, `ADMIN_EMAILS` contendo o e-mail autorizado e `ADMIN_SETUP_EMAIL` com esse e-mail.
2. Gerar um segredo aleatório de 32 bytes para `ADMIN_SETUP_TOKEN` e uma data futura ISO para `ADMIN_SETUP_EXPIRES` (preferencialmente 24 horas). Guardar como segredo, nunca no código ou em arquivos públicos.
3. Publicar a versão com as migrações do banco e essa configuração.
4. Abrir reservadamente `/admin#configurar=TOKEN` no endereço HTTPS. A pessoa escolhe o usuário e uma senha de 14 a 128 caracteres diretamente no formulário. O token sai da barra de endereço ao carregar e só permite a criação da primeira conta.
5. Após a criação, remover as variáveis de convite e reaplicar a configuração. Entrar normalmente por `/admin`.

O formulário não cria a conta apenas com um e-mail. A conta só existe depois de concluir o primeiro acesso. A criação e os testes locais usaram um banco isolado; nenhuma senha de teste deve ir para produção.

## Uso diário e recuperação

- Em `/admin`, informar usuário e senha. A sessão dura até oito horas; usar **Sair da conta** ao terminar.
- **Alterar senha** exige a senha atual e encerra as outras sessões.
- Se esquecer a senha, o responsável pela hospedagem deve confirmar a identidade e gerar um novo segredo em `ADMIN_RESET_TOKEN`, informar o usuário exato (minúsculo) em `ADMIN_RESET_USERNAME` e uma validade curta em `ADMIN_RESET_EXPIRES`. Após aplicar a configuração, entregar reservadamente `/admin#recuperar=TOKEN`. O convite funciona uma vez. Remover as variáveis depois do uso.
- Recuperação automática por e-mail e gestão de várias contas/perfis ainda não foram implementadas. O envio de e-mails depende de um serviço configurado.

## Segurança e hospedagem

As senhas são guardadas como hashes scrypt com sal aleatório. A sessão fica em cookie HttpOnly, Secure e SameSite=Strict; o banco guarda apenas o hash do token. As APIs verificam autenticação e origem das alterações, e tentativas de entrada têm limites. HTTPS é obrigatório em produção.

No Sites, a restrição de audiência da própria prévia é uma camada separada. O login próprio não remove essa barreira: uma prévia restrita pode continuar exigindo a conta da plataforma antes de mostrar o site. Para acesso sem ChatGPT, é necessário usar hospedagem independente ou autorizar explicitamente que a prévia fique acessível ao público, mantendo `/admin` protegido pelo login próprio. A audiência não deve ser alterada silenciosamente.

## Editor visual

Entrar em **Editar site visualmente**, selecionar a página e clicar no conteúdo. É possível alterar textos, imagens, links, cores, tamanho e alinhamento, criar seções com texto/imagem/botão, reorganizar ou ocultar seções e conferir a apresentação no celular. Cabeçalho e rodapé compartilham as alterações entre páginas.

Cursos, destaques, apostilas e provas usam seus cadastros próprios, abertos a partir do editor. Salvar mantém um rascunho; **Publicar no site** torna as alterações visíveis. Desfazer/refazer funciona na sessão do editor; versões anteriores permanecem no histórico.

O editor cobre os elementos das páginas existentes e seções padronizadas. Não é um construtor arbitrário de novas páginas ou de código HTML. Os formulários e as regras de negócio continuam controlados pelo projeto.
