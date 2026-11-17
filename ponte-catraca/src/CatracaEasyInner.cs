using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Linq;
using System.Text;
using System.Threading;

namespace PonteCatraca
{
    /// Catracas Topdata Inner com leitor de digital, em modo online, via EasyInner.dll.
    /// Uma porta TCP para todas as catracas; cada uma é chamada pelo seu número (Inner nº).
    ///
    /// Fluxo: a catraca identifica a digital sozinha (1:N, banco da própria catraca) e manda
    /// o número do usuário. A ponte decide; se liberar, espera Origem 6 (girou) ou
    /// Origem 5 (acabou o tempo = desistência) e só então rearma a leitura daquela catraca.
    ///
    /// Conferido com o SDK EasyInner 6.0.2 (exemplo C# oficial, FrmOnlineController e Enumeradores):
    ///   - Origem 12 = SENSOR_BIOMETRICO, 5 = fim do tempo (não girou), 6 = giro
    ///   - ReceberDadosOnLine: 0 = chegou evento; qualquer outro valor = nada novo
    ///   - FormaEntrada 100 = leitor 1 + identificação biométrica (o exemplo monta o mesmo valor por bits)
    ///   - Acionamento 6 = saída livre e entrada controlada (caso do GETEPE)
    public partial class CatracaEasyInner : ICatraca
    {
        // Origens (EasyInnerInterop.cs da Topdata, exceto 12 que vem do manual)
        const byte ORIGEM_TECLADO = 1, ORIGEM_LEITOR1 = 2, ORIGEM_LEITOR2 = 3;
        const byte ORIGEM_FIM_TEMPO = 5, ORIGEM_GIRO = 6, ORIGEM_BIOMETRIA = 12;

        const byte TCP_PORTA_FIXA = 2;
        const byte FORMA_LEITOR1_IDENTIFICACAO_BIO = 100;

        class Estado
        {
            public int numero;
            public bool conectada;
            public bool aguardandoGiro;
            public int pingsFalhos;
            public int tipoBio = -1;   // módulo biométrico (0 = LN, 1 = LC, 2 = LM); -1 = desconhecido, não copia digitais
            public readonly Stopwatch desdeLiberacao = new Stopwatch();
            public readonly Stopwatch desdePing = new Stopwatch();
            public readonly Stopwatch desdeTentativa = new Stopwatch();
        }

        readonly Config cfg;
        readonly List<Estado> catracas;
        bool portaAberta;
        int proxima;   // revezamento entre as catracas

        public CatracaEasyInner(Config cfg)
        {
            this.cfg = cfg;
            catracas = cfg.inners.Select(n => new Estado { numero = n }).ToList();
        }

        static void Ok(byte ret, string comando)
        {
            if (ret != EasyInner.RET_COMANDO_OK)
            {
                var dica = ret == 8 ? " (GPF: DLL não registrada, faltando dependência ou programa não está em 32 bits)" : "";
                throw new Exception(comando + " retornou " + ret + dica);
            }
        }

        Estado De(int equipamento)
        {
            var e = catracas.FirstOrDefault(x => x.numero == equipamento);
            if (e == null) throw new Exception("Catraca " + equipamento + " não está em \"inners\".");
            return e;
        }

        public bool Conectada(int equipamento)
        {
            var e = catracas.FirstOrDefault(x => x.numero == equipamento);
            return e != null && e.conectada;
        }

        public void Conectar()
        {
            if (!portaAberta)
            {
                Ok(EasyInner.DefinirTipoConexao(TCP_PORTA_FIXA), "DefinirTipoConexao");
                Ok(EasyInner.AbrirPortaComunicacao(cfg.portaCatraca), "AbrirPortaComunicacao");
                portaAberta = true;
            }
            // A porta fica aberta o tempo todo: no modo TCP de porta fixa são as catracas que se conectam ao PC,
            // e elas levam alguns segundos para isso. Fechar e reabrir a porta impede a conexão.
            Log.Info("Porta " + cfg.portaCatraca + " aberta; esperando as catracas se conectarem ao PC...");
            foreach (var e in catracas) TentarConectar(e, 20);
            if (!catracas.Any(e => e.conectada))
                Log.Aviso("Nenhuma catraca conectou ainda. Continuo tentando a cada 15 s. Se não conectar: confira se o Secullum "
                    + "está parado (Ligar Online > Parar), se o firewall permitiu o PonteCatraca e, no Secullum, o tipo de conexão de cada catraca.");
        }

        /// Liga e configura uma catraca. Se não responder, fica marcada como desconectada e é tentada de novo depois.
        void TentarConectar(Estado e, int segundos)
        {
            e.desdeTentativa.Restart();
            try
            {
                // Mesmo teste do exemplo oficial: ler o relógio só funciona com a catraca conectada de verdade.
                var t = Stopwatch.StartNew();
                byte r, d = 0, mo = 0, a = 0, h = 0, mi = 0, s = 0;
                while ((r = EasyInner.ReceberRelogio(e.numero, ref d, ref mo, ref a, ref h, ref mi, ref s)) != EasyInner.RET_COMANDO_OK)
                {
                    if (t.Elapsed.TotalSeconds > segundos) throw new Exception("ainda não conectou ao PC (retorno " + r + ")");
                    Thread.Sleep(500);
                }
                Log.Info("Catraca " + e.numero + " respondeu (relógio " + d.ToString("00") + "/" + mo.ToString("00") + " " + h.ToString("00") + ":" + mi.ToString("00") + ").");

                // Firmware 5 ou mais novo: usuários biométricos com até 16 dígitos (como no exemplo oficial).
                byte linha = 0, vAlta = 0, vBaixa = 0, vSufixo = 0, acessoBio = 0; short variacao = 0;
                var rf = EasyInner.ReceberVersaoFirmware(e.numero, ref linha, ref variacao, ref vAlta, ref vBaixa, ref vSufixo, ref acessoBio);
                if (rf == EasyInner.RET_COMANDO_OK)
                    Log.Info("Catraca " + e.numero + ": firmware " + vAlta + "." + vBaixa + " (linha " + linha + ", variação " + variacao + ", bio " + acessoBio + ")");
                else Log.Aviso("Catraca " + e.numero + ": não consegui ler o firmware (retorno " + rf + ").");

                // Tipo do módulo biométrico, necessário para copiar digitais entre as catracas (firmware 6 ou mais novo).
                if (rf == EasyInner.RET_COMANDO_OK && vAlta >= 6 && acessoBio == 1)
                {
                    byte l6 = 0, a6 = 0, b6 = 0, s6 = 0, bio6 = 0, tipo = 0; short v6 = 0;
                    var r6 = EasyInner.ReceberVersaoFirmware6xx(e.numero, ref l6, ref v6, ref a6, ref b6, ref s6, ref bio6, ref tipo);
                    if (r6 == EasyInner.RET_COMANDO_OK) { e.tipoBio = tipo; Log.Info("Catraca " + e.numero + ": módulo biométrico tipo " + tipo + "."); }
                    else Log.Aviso("Catraca " + e.numero + ": não consegui ler o tipo do módulo biométrico (retorno " + r6 + "); não vou copiar digitais.");
                }

                // O exemplo oficial tenta enviar a configuração até 3 vezes; o buffer da DLL se esvazia a cada envio.
                byte ret = 1;
                for (int tentativa = 1; tentativa <= 3 && ret != EasyInner.RET_COMANDO_OK; tentativa++)
                {
                    MontarConfiguracao(vAlta);
                    ret = EasyInner.EnviarConfiguracoes(e.numero);
                    if (ret != EasyInner.RET_COMANDO_OK) { Log.Aviso("Catraca " + e.numero + ": EnviarConfiguracoes retornou " + ret + " (tentativa " + tentativa + ")"); Thread.Sleep(1000); }
                }
                Ok(ret, "EnviarConfiguracoes");

                Rearmar(e);
                e.conectada = true;
                e.pingsFalhos = 0;
                e.desdePing.Restart();
                Log.Info("Catraca " + e.numero + " conectada, em modo online.");
            }
            catch (Exception ex)
            {
                e.conectada = false;
                Log.Erro("Catraca " + e.numero + ": " + ex.Message);
            }
        }

        void MontarConfiguracao(byte vAlta)
        {
                // Configuração igual à do exemplo oficial da Topdata (FrmOnlineController.MontaConfiguracaoInner).
                // Fica num buffer da DLL até EnviarConfiguracoes, por isso vai uma catraca de cada vez.
                // DefinirPadraoCartao precisa vir antes da quantidade de dígitos (ele reseta para 14).
                Ok(EasyInner.DefinirPadraoCartao(1), "DefinirPadraoCartao");               // formato livre
                Ok(EasyInner.ConfigurarInnerOnLine(), "ConfigurarInnerOnLine");
                if (cfg.liberarSaidaSempre)
                {
                    // Dedo também na saída: o acionamento registra entrada ou saída conforme o giro.
                    Ok(EasyInner.ConfigurarAcionamento1(1, (byte)cfg.tempoLiberacaoSegundos), "ConfigurarAcionamento1");
                    Ok(EasyInner.ConfigurarAcionamento2(0, 0), "ConfigurarAcionamento2");
                    Ok(EasyInner.ConfigurarLeitor1(3), "ConfigurarLeitor1");               // entrada e saída
                }
                else
                {
                    // GETEPE: saída livre (6 = CATRACA_SAIDA_LIBERADA), dedo só na entrada.
                    // ATENÇÃO: 8 = catraca livre nos DOIS sentidos (qualquer um passa). Não usar.
                    Ok(EasyInner.ConfigurarAcionamento1(6, (byte)cfg.tempoLiberacaoSegundos), "ConfigurarAcionamento1");
                    Ok(EasyInner.ConfigurarLeitor1(1), "ConfigurarLeitor1");               // só entrada
                }
                Ok(EasyInner.ConfigurarLeitor2(0), "ConfigurarLeitor2");                   // desativado
                Ok(EasyInner.DefinirQuantidadeDigitosCartao((byte)cfg.qtdDigitosCodigo), "DefinirQuantidadeDigitosCartao");
                Ok(EasyInner.HabilitarTeclado(0, 0), "HabilitarTeclado");
                Ok(EasyInner.RegistrarAcessoNegado(0), "RegistrarAcessoNegado");
                // Registro padrão do leitor/digital: 10 = sempre entrada; 12 = conforme o giro.
                var funcaoPadrao = (byte)(cfg.liberarSaidaSempre ? 12 : 10);
                Ok(EasyInner.DefinirFuncaoDefaultLeitoresProximidade(funcaoPadrao), "DefinirFuncaoDefaultLeitoresProximidade");
                Ok(EasyInner.DefinirFuncaoDefaultSensorBiometria(funcaoPadrao), "DefinirFuncaoDefaultSensorBiometria");
                if (vAlta >= 5) { EasyInner.SetarBioVariavel(1); EasyInner.ConfigurarBioVariavel(1); }
                Ok(EasyInner.ReceberDataHoraDadosOnLine(1), "ReceberDataHoraDadosOnLine");
        }

        public void Desconectar()
        {
            foreach (var e in catracas) e.conectada = false;
            if (portaAberta)
            {
                try { EasyInner.FecharPortaComunicacao(); } catch { }
                portaAberta = false;
            }
        }

        /// Volta a catraca ao estado "esperando dedo".
        void Rearmar(Estado e)
        {
            e.aguardandoGiro = false;
            EasyInner.EnviarMensagemPadraoOnLine(e.numero, 0, Linhas("COLOQUE O", "DEDO"));
            Ok(EasyInner.EnviarFormasEntradasOnLine(e.numero, 0, 0, FORMA_LEITOR1_IDENTIFICACAO_BIO, 10, 17),
                "EnviarFormasEntradasOnLine");
        }

        public Leitura Aguardar(int timeoutMs)
        {
            var t = Stopwatch.StartNew();
            var cartao = new StringBuilder(32);
            while (t.ElapsedMilliseconds < timeoutMs)
            {
                for (int i = 0; i < catracas.Count; i++)
                {
                    var e = catracas[(proxima + i) % catracas.Count];
                    var l = Consultar(e, cartao);
                    if (l != null)
                    {
                        proxima = (catracas.IndexOf(e) + 1) % catracas.Count;   // a próxima busca começa pela outra catraca
                        return l;
                    }
                }
                TalvezSincronizarDigitais();
                Thread.Sleep(75);
            }
            return null;
        }

        Leitura Consultar(Estado e, StringBuilder cartao)
        {
            if (!e.conectada)
            {
                if (e.desdeTentativa.Elapsed.TotalSeconds >= 15) TentarConectar(e, 3);
                return null;
            }

            byte origem = 0, compl = 0, dia = 0, mes = 0, ano = 0, hora = 0, min = 0, seg = 0;
            cartao.Length = 0;
            var ret = EasyInner.ReceberDadosOnLine(e.numero, ref origem, ref compl, cartao,
                ref dia, ref mes, ref ano, ref hora, ref min, ref seg);
            if (ret == EasyInner.RET_COMANDO_OK)
                return Interpretar(e, origem, compl, cartao.ToString().Trim());

            // Sem evento (qualquer retorno diferente de 0): a cada 3 s manda PingOnLine, como o exemplo oficial.
            if (e.desdePing.ElapsedMilliseconds > 3000)
            {
                e.desdePing.Restart();
                if (EasyInner.PingOnLine(e.numero) != EasyInner.RET_COMANDO_OK)
                {
                    if (++e.pingsFalhos >= 3)
                    {
                        e.conectada = false;
                        e.desdeTentativa.Restart();
                        Log.Erro("Catraca " + e.numero + " parou de responder; tentando de novo a cada 15 s.");
                    }
                }
                else e.pingsFalhos = 0;
            }

            // Se a confirmação de giro nunca chegar, não deixa a catraca travada sem ler.
            if (e.aguardandoGiro && e.desdeLiberacao.Elapsed.TotalSeconds > cfg.tempoLiberacaoSegundos + 10)
            {
                Log.Aviso("Catraca " + e.numero + ": sem confirmação de giro; rearmando a leitura.");
                Rearmar(e);
            }
            return null;
        }

        Leitura Interpretar(Estado e, byte origem, byte compl, string cartao)
        {
            switch (origem)
            {
                case ORIGEM_BIOMETRIA:
                case ORIGEM_LEITOR1:
                case ORIGEM_LEITOR2:
                case ORIGEM_TECLADO:
                    // Digital: o exemplo oficial fica só com os dígitos e tira os zeros à esquerda.
                    if (origem == ORIGEM_BIOMETRIA) cartao = new string(cartao.Where(char.IsDigit).ToArray());
                    if (cartao.Length == 0) { Rearmar(e); return null; }
                    return new Leitura
                    {
                        tipo = TipoLeitura.Identificacao,
                        equipamento = e.numero,
                        codigo = cartao,
                        origem = origem == ORIGEM_BIOMETRIA ? "digital" : "origem " + origem
                    };

                case ORIGEM_GIRO:
                    Rearmar(e);
                    return new Leitura { tipo = TipoLeitura.Giro, equipamento = e.numero, origem = compl == 1 ? "entrada" : "saida" };

                case ORIGEM_FIM_TEMPO:
                    var estava = e.aguardandoGiro;
                    Rearmar(e);
                    return estava ? new Leitura { tipo = TipoLeitura.Desistencia, equipamento = e.numero, origem = "fim do tempo" } : null;

                default:
                    // Registrar tudo que não conhecemos ajuda a acertar os códigos no primeiro teste.
                    Log.Aviso("Catraca " + e.numero + ": evento não tratado: origem=" + origem + " complemento=" + compl + " cartao='" + cartao + "'");
                    Rearmar(e);
                    return null;
            }
        }

        public void Liberar(int equipamento, string linha1, string linha2, bool apenasEntrada)
        {
            var e = De(equipamento);
            EasyInner.EnviarMensagemTemporariaOnLine(e.numero, 0, Linhas(linha1, linha2), (byte)cfg.tempoLiberacaoSegundos);
            Ok(apenasEntrada ? EasyInner.LiberarCatracaEntrada(e.numero) : EasyInner.LiberarCatracaDoisSentidos(e.numero),
                "LiberarCatraca");
            e.aguardandoGiro = true;
            e.desdeLiberacao.Restart();
        }

        public void Negar(int equipamento, string linha1, string linha2)
        {
            var e = De(equipamento);
            // Sem pausa aqui: enquanto uma catraca mostra a mensagem, a outra continua sendo atendida.
            Rearmar(e);
            EasyInner.AcionarBipLongo(e.numero);
            EasyInner.EnviarMensagemTemporariaOnLine(e.numero, 0, Linhas(linha1, linha2), 3);
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
