using System;
using System.Diagnostics;
using System.Text;
using System.Threading;

namespace PonteCatraca
{
    /// Catraca Topdata Inner com leitor de digital, em modo online, via EasyInner.dll.
    ///
    /// Fluxo: a catraca identifica a digital sozinha (1:N, banco da própria catraca) e manda
    /// o número do usuário. A ponte decide; se liberar, espera Origem 6 (girou) ou
    /// Origem 5 (acabou o tempo = desistência) e só então rearma a leitura.
    ///
    /// PONTOS A CONFIRMAR NO EQUIPAMENTO (marcados com "CONFIRMAR"):
    ///   - qual Origem chega para digital (manual diz 12; exemplos oficiais só documentam 1 a 10)
    ///   - valor de retorno de ReceberDadosOnLine quando não há evento
    ///   - qual ConfigurarAcionamento controla o tempo de liberação da catraca
    public class CatracaEasyInner : ICatraca
    {
        // Origens (EasyInnerInterop.cs da Topdata, exceto 12 que vem do manual)
        const byte ORIGEM_TECLADO = 1, ORIGEM_LEITOR1 = 2, ORIGEM_LEITOR2 = 3;
        const byte ORIGEM_FIM_TEMPO = 5, ORIGEM_GIRO = 6, ORIGEM_BIOMETRIA = 12;   // CONFIRMAR 12

        const byte TCP_PORTA_FIXA = 2;
        const byte FORMA_LEITOR1_IDENTIFICACAO_BIO = 100;
        const string MSG_PADRAO = "GTP  COLOQUE O  DEDO NO LEITOR";

        readonly Config cfg;
        readonly int inner;
        bool portaAberta;
        bool aguardandoGiro;
        readonly Stopwatch desdeUltimoPing = new Stopwatch();
        readonly Stopwatch desdeLiberacao = new Stopwatch();
        int pingsFalhos;

        public CatracaEasyInner(Config cfg)
        {
            this.cfg = cfg;
            inner = cfg.numeroInner;
        }

        static void Ok(byte ret, string comando)
        {
            if (ret != EasyInner.RET_COMANDO_OK)
            {
                var dica = ret == 8 ? " (GPF: DLL não registrada, faltando dependência ou programa não está em 32 bits)" : "";
                throw new Exception(comando + " retornou " + ret + dica);
            }
        }

        public void Conectar()
        {
            if (!portaAberta)
            {
                Ok(EasyInner.DefinirTipoConexao(TCP_PORTA_FIXA), "DefinirTipoConexao");
                Ok(EasyInner.AbrirPortaComunicacao(cfg.portaCatraca), "AbrirPortaComunicacao");
                portaAberta = true;
            }

            // A Inner pode demorar a responder depois de ligada: insiste por até 30 s.
            var t = Stopwatch.StartNew();
            byte r;
            while ((r = EasyInner.Ping(inner)) != EasyInner.RET_COMANDO_OK)
            {
                if (t.Elapsed.TotalSeconds > 30) throw new Exception("Inner " + inner + " não respondeu ao Ping (retorno " + r + ")");
                Thread.Sleep(500);
            }

            // Configuração. DefinirPadraoCartao precisa vir antes da quantidade de dígitos (ele reseta para 14).
            Ok(EasyInner.ConfigurarInnerOnLine(), "ConfigurarInnerOnLine");
            Ok(EasyInner.DefinirPadraoCartao(1), "DefinirPadraoCartao");               // formato livre
            Ok(EasyInner.DefinirQuantidadeDigitosCartao((byte)cfg.qtdDigitosCodigo), "DefinirQuantidadeDigitosCartao");
            Ok(EasyInner.HabilitarTeclado(0, 0), "HabilitarTeclado");
            Ok(EasyInner.ConfigurarLeitor1(3), "ConfigurarLeitor1");                   // entrada e saída
            Ok(EasyInner.ConfigurarLeitor2(0), "ConfigurarLeitor2");                   // desativado
            // CONFIRMAR: função 8 = catraca liberada nos dois sentidos; tempo de liberação em segundos.
            Ok(EasyInner.ConfigurarAcionamento1(8, (byte)cfg.tempoLiberacaoSegundos), "ConfigurarAcionamento1");
            Ok(EasyInner.ConfigurarAcionamento2(0, 0), "ConfigurarAcionamento2");
            Ok(EasyInner.ReceberDataHoraDadosOnLine(1), "ReceberDataHoraDadosOnLine");
            Ok(EasyInner.EnviarConfiguracoes(inner), "EnviarConfiguracoes");

            Rearmar();
            desdeUltimoPing.Restart();
            pingsFalhos = 0;
        }

        public void Desconectar()
        {
            if (portaAberta)
            {
                try { EasyInner.FecharPortaComunicacao(); } catch { }
                portaAberta = false;
            }
        }

        /// Volta a catraca ao estado "esperando dedo".
        void Rearmar()
        {
            aguardandoGiro = false;
            EasyInner.EnviarMensagemPadraoOnLine(inner, 0, MSG_PADRAO);
            Ok(EasyInner.EnviarFormasEntradasOnLine(inner, 0, 0, FORMA_LEITOR1_IDENTIFICACAO_BIO, 10, 17),
                "EnviarFormasEntradasOnLine");
        }

        public Leitura Aguardar(int timeoutMs)
        {
            var t = Stopwatch.StartNew();
            var cartao = new StringBuilder(32);
            while (t.ElapsedMilliseconds < timeoutMs)
            {
                byte origem = 0, compl = 0, dia = 0, mes = 0, ano = 0, hora = 0, min = 0, seg = 0;
                cartao.Length = 0;
                var ret = EasyInner.ReceberDadosOnLine(inner, ref origem, ref compl, cartao,
                    ref dia, ref mes, ref ano, ref hora, ref min, ref seg);

                if (ret == EasyInner.RET_COMANDO_OK)
                {
                    var l = Interpretar(origem, compl, cartao.ToString().Trim());
                    if (l != null) return l;
                    continue;
                }

                // Sem evento (CONFIRMAR o código exato): mantém a conexão viva.
                if (desdeUltimoPing.ElapsedMilliseconds > 5000)
                {
                    desdeUltimoPing.Restart();
                    if (EasyInner.PingOnLine(inner) != EasyInner.RET_COMANDO_OK)
                    {
                        if (++pingsFalhos >= 3) throw new Exception("Inner " + inner + " parou de responder.");
                    }
                    else pingsFalhos = 0;
                }

                // Se a confirmação de giro nunca chegar, não deixa a catraca travada sem ler.
                if (aguardandoGiro && desdeLiberacao.Elapsed.TotalSeconds > cfg.tempoLiberacaoSegundos + 10)
                {
                    Log.Aviso("Sem confirmação de giro; rearmando a leitura.");
                    Rearmar();
                }

                Thread.Sleep(75);
            }
            return null;
        }

        Leitura Interpretar(byte origem, byte compl, string cartao)
        {
            switch (origem)
            {
                case ORIGEM_BIOMETRIA:
                case ORIGEM_LEITOR1:
                case ORIGEM_LEITOR2:
                case ORIGEM_TECLADO:
                    if (cartao.Length == 0) { Rearmar(); return null; }
                    return new Leitura
                    {
                        tipo = TipoLeitura.Identificacao,
                        codigo = cartao,
                        origem = origem == ORIGEM_BIOMETRIA ? "digital" : "origem " + origem
                    };

                case ORIGEM_GIRO:
                    Rearmar();
                    return new Leitura { tipo = TipoLeitura.Giro, origem = compl == 1 ? "entrada" : "saida" };

                case ORIGEM_FIM_TEMPO:
                    var estava = aguardandoGiro;
                    Rearmar();
                    return estava ? new Leitura { tipo = TipoLeitura.Desistencia, origem = "fim do tempo" } : null;

                default:
                    // Registrar tudo que não conhecemos ajuda a acertar os códigos no primeiro teste.
                    Log.Aviso("Evento não tratado: origem=" + origem + " complemento=" + compl + " cartao='" + cartao + "'");
                    Rearmar();
                    return null;
            }
        }

        public void Liberar(string linha1, string linha2, bool apenasEntrada)
        {
            EasyInner.EnviarMensagemTemporariaOnLine(inner, 0, Linhas(linha1, linha2), (byte)cfg.tempoLiberacaoSegundos);
            Ok(apenasEntrada ? EasyInner.LiberarCatracaEntrada(inner) : EasyInner.LiberarCatracaDoisSentidos(inner),
                "LiberarCatraca");
            aguardandoGiro = true;
            desdeLiberacao.Restart();
        }

        public void Negar(string linha1, string linha2)
        {
            EasyInner.LigarLedVermelho(inner);
            EasyInner.AcionarBipLongo(inner);
            EasyInner.EnviarMensagemTemporariaOnLine(inner, 0, Linhas(linha1, linha2), 3);
            Thread.Sleep(1500);
            EasyInner.DesligarLedVermelho(inner);
            Rearmar();
        }

        /// O visor tem 2 linhas de 16 caracteres; a mensagem é uma string só de até 32. Cada linha vai centralizada.
        static string Linhas(string l1, string l2)
        {
            return Centro(l1) + Centro(l2);
        }

        static string Centro(string s)
        {
            s = (s ?? "").Trim();
            if (s.Length > 16) s = s.Substring(0, 16);
            return s.PadLeft((16 + s.Length) / 2).PadRight(16);
        }
    }
}
