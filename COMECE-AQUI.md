# Abrir este projeto em outro computador

Esta pasta contém o código e as imagens da versão publicada do site GETEPE (versão 29, 12/11/2026).

## Pelo GitHub Desktop
1. Publique este repositório mantendo **Keep this code private** marcado.
2. No outro computador, entre na conta autorizada no GitHub Desktop.
3. Use File > Clone repository, escolha site-gtp e selecione uma pasta local.
4. Antes de trabalhar, use Fetch origin e Pull origin quando disponível.
5. Depois das alterações, faça Commit e Push origin. Salvar arquivos sozinho não os envia ao GitHub.

## Rodar uma cópia local
Instale Node.js 22.13 ou superior. Abra um terminal nesta pasta e execute:

```text
npm run install:ci
npm run dev
```

Abra o endereço que aparecer no terminal (normalmente http://localhost:5173).
A instalação baixa as dependências e requer internet. O teste local usa dados e configurações locais; não leva a conta administrativa do site publicado. Consulte LOGIN-ADMIN.md para configuração de acesso. Os comandos desta cópia ainda precisam ser validados no novo computador.

## O que acompanha esta cópia
Código, imagens publicadas, conteúdo inicial em seed.json, estrutura do banco e documentação. A arte restaurada dos aprovados mostrada apenas como prévia não substitui a imagem publicada nesta cópia.

## O que fica separado
Senhas, chaves, sessões, banco de dados de produção, cadastros e arquivos enviados pelo painel. O GitHub não é um backup desses dados; é necessário exportá-los separadamente.

## Publicação
Commit e Push não atualizam o site automaticamente. A hospedagem atual continua separada. A configuração .openai/hosting.json identifica o site atual e não contém senha; não altere esse vínculo sem planejar a hospedagem.

O histórico começa neste repositório do GitHub; o histórico técnico da hospedagem não foi copiado. A pasta .git que você criou foi preservada.
