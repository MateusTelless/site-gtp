using System.Runtime.InteropServices;
using System.Text;

namespace PonteCatraca
{
    /// Declarações da EasyInner.dll (Topdata). Assinaturas copiadas do EasyInnerInterop.cs de
    /// exemplo da Topdata. A DLL é 32 bits e não é thread-safe: chame tudo de UMA thread só.
    /// Nomes diferenciam maiúsculas: é "PingOnLine", não "PingOnline".
    internal static class EasyInner
    {
        const string Dll = "EasyInner.dll";
        const CallingConvention Cc = CallingConvention.Winapi;

        public const byte RET_COMANDO_OK = 0;

        // ---- conexão ----
        [DllImport(Dll, CallingConvention = Cc)] public static extern byte DefinirTipoConexao(byte tipo);
        [DllImport(Dll, CallingConvention = Cc)] public static extern byte AbrirPortaComunicacao(int porta);
        [DllImport(Dll, CallingConvention = Cc)] public static extern void FecharPortaComunicacao();
        [DllImport(Dll, CallingConvention = Cc)] public static extern byte Ping(int inner);
        [DllImport(Dll, CallingConvention = Cc)] public static extern byte PingOnLine(int inner);
        // O exemplo oficial testa a conexão lendo o relógio (o Ping pode responder OK sem a catraca conectada).
        [DllImport(Dll, CallingConvention = Cc)]
        public static extern byte ReceberRelogio(int inner, ref byte dia, ref byte mes, ref byte ano,
            ref byte hora, ref byte minuto, ref byte segundo);

        // ---- configuração (fica num buffer da DLL até EnviarConfiguracoes) ----
        [DllImport(Dll, CallingConvention = Cc)] public static extern byte ConfigurarInnerOnLine();
        [DllImport(Dll, CallingConvention = Cc)] public static extern byte ConfigurarTipoLeitor(byte tipo);
        [DllImport(Dll, CallingConvention = Cc)] public static extern byte ConfigurarLeitor1(byte operacao);
        [DllImport(Dll, CallingConvention = Cc)] public static extern byte ConfigurarLeitor2(byte operacao);
        [DllImport(Dll, CallingConvention = Cc)] public static extern byte ConfigurarAcionamento1(byte funcao, byte tempo);
        [DllImport(Dll, CallingConvention = Cc)] public static extern byte ConfigurarAcionamento2(byte funcao, byte tempo);
        [DllImport(Dll, CallingConvention = Cc)] public static extern byte DefinirPadraoCartao(byte padrao);
        [DllImport(Dll, CallingConvention = Cc)] public static extern byte DefinirQuantidadeDigitosCartao(byte quantidade);
        [DllImport(Dll, CallingConvention = Cc)] public static extern byte HabilitarTeclado(byte habilita, byte ecoar);
        [DllImport(Dll, CallingConvention = Cc)] public static extern byte ReceberDataHoraDadosOnLine(byte recebe);
        [DllImport(Dll, CallingConvention = Cc)] public static extern byte EnviarConfiguracoes(int inner);
        [DllImport(Dll, CallingConvention = Cc)] public static extern byte DefinirFuncaoDefaultSensorBiometria(byte funcao);
        [DllImport(Dll, CallingConvention = Cc)] public static extern byte DefinirFuncaoDefaultLeitoresProximidade(byte funcao);
        [DllImport(Dll, CallingConvention = Cc)] public static extern byte RegistrarAcessoNegado(byte tipoRegistro);
        [DllImport(Dll, CallingConvention = Cc)] public static extern void SetarBioVariavel(int maior);
        [DllImport(Dll, CallingConvention = Cc)] public static extern void ConfigurarBioVariavel(int maior);
        [DllImport(Dll, CallingConvention = Cc)]
        public static extern byte ReceberVersaoFirmware(int inner, ref byte linha, ref short variacao, ref byte versaoAlta,
            ref byte versaoBaixa, ref byte versaoSufixo, ref byte innerAcessoBio);

        // ---- modo online ----
        [DllImport(Dll, CallingConvention = Cc)]
        public static extern byte EnviarFormasEntradasOnLine(int inner, byte qtdeDigitosTeclado, byte ecoTeclado,
            byte formaEntrada, byte tempoTeclado, byte posicaoCursorTeclado);

        [DllImport(Dll, CallingConvention = Cc, CharSet = CharSet.Ansi)]
        public static extern byte ReceberDadosOnLine(int inner, ref byte origem, ref byte complemento,
            StringBuilder cartao, ref byte dia, ref byte mes, ref byte ano,
            ref byte hora, ref byte minuto, ref byte segundo);

        [DllImport(Dll, CallingConvention = Cc)] public static extern byte LiberarCatracaEntrada(int inner);
        [DllImport(Dll, CallingConvention = Cc)] public static extern byte LiberarCatracaSaida(int inner);
        [DllImport(Dll, CallingConvention = Cc)] public static extern byte LiberarCatracaDoisSentidos(int inner);

        [DllImport(Dll, CallingConvention = Cc, CharSet = CharSet.Ansi)]
        public static extern byte EnviarMensagemPadraoOnLine(int inner, byte exibirData, string mensagem);

        [DllImport(Dll, CallingConvention = Cc, CharSet = CharSet.Ansi)]
        public static extern byte EnviarMensagemTemporariaOnLine(int inner, byte exibirData, string mensagem, byte tempo);

        [DllImport(Dll, CallingConvention = Cc)] public static extern byte AcionarBipCurto(int inner);
        [DllImport(Dll, CallingConvention = Cc)] public static extern byte AcionarBipLongo(int inner);
        [DllImport(Dll, CallingConvention = Cc)] public static extern byte LigarLedVermelho(int inner);
        [DllImport(Dll, CallingConvention = Cc)] public static extern byte DesligarLedVermelho(int inner);
        [DllImport(Dll, CallingConvention = Cc)] public static extern byte LigarLedVerde(int inner);
        [DllImport(Dll, CallingConvention = Cc)] public static extern byte DesligarLedVerde(int inner);

        // ---- biometria (cadastro de digitais; usado pela ferramenta de cadastro, próxima etapa) ----
        [DllImport(Dll, CallingConvention = Cc, CharSet = CharSet.Ansi)]
        public static extern byte InserirUsuarioLeitorBio(int inner, byte tipo, string usuario);
        [DllImport(Dll, CallingConvention = Cc)]
        public static extern byte ResultadoInsercaoUsuarioLeitorBio(int inner, byte onLine);
        [DllImport(Dll, CallingConvention = Cc, CharSet = CharSet.Ansi)]
        public static extern byte SolicitarUsuarioCadastradoBio(int inner, string usuario);
        [DllImport(Dll, CallingConvention = Cc)]
        public static extern byte ReceberUsuarioCadastradoBio(int inner, byte onLine, byte[] template); // 844 bytes
        [DllImport(Dll, CallingConvention = Cc)]
        public static extern byte EnviarUsuarioBio(int inner, byte[] template);                       // 844 bytes
        [DllImport(Dll, CallingConvention = Cc)]
        public static extern byte UsuarioFoiEnviado(int inner, byte onLine);
        [DllImport(Dll, CallingConvention = Cc, CharSet = CharSet.Ansi)]
        public static extern byte SolicitarExclusaoUsuario(int inner, string usuario);
        [DllImport(Dll, CallingConvention = Cc)]
        public static extern byte UsuarioFoiExcluido(int inner, byte onLine);
    }
}
