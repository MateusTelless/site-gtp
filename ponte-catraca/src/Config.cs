using System;
using System.Collections.Generic;
using System.IO;
using System.Web.Script.Serialization;

namespace PonteCatraca
{
    public class Config
    {
        // Worker
        public string urlApi = "https://SEU-DOMINIO/api/catraca";
        public string token = "";
        public int intervaloSyncSegundos = 60;

        // Catraca
        public string modoCatraca = "easyinner";   // "easyinner" ou "simulada"
        // Número de cada catraca (Inner nº, o mesmo da tela de equipamentos do Secullum). O GTP tem duas: [1, 2].
        public List<int> inners = new List<int>();
        public int numeroInner = 1;                 // usado só se "inners" estiver vazio (configuração antiga)
        public string ipCatraca = "192.168.0.100";  // só para referência no log; a DLL acha cada Inner pelo número
        public int portaCatraca = 3570;
        public int tempoLiberacaoSegundos = 5;
        // false: o dedo libera só a entrada (a saída do GTP já é livre na catraca).
        // true: o dedo libera os dois sentidos (para catracas que pedem o dedo também na saída).
        public bool liberarSaidaSempre = false;
        public int qtdDigitosCodigo = 14;

        // Códigos que sempre passam (professores, equipe), mesmo sem internet
        public List<string> codigosSempreLiberados = new List<string>();

        public string pastaDados = "dados";

        public static Config Carregar(string caminho)
        {
            if (!File.Exists(caminho))
                throw new FileNotFoundException("Arquivo de configuração não encontrado: " + caminho);
            var json = File.ReadAllText(caminho);
            var cfg = new JavaScriptSerializer().Deserialize<Config>(json);
            if (cfg.codigosSempreLiberados == null) cfg.codigosSempreLiberados = new List<string>();
            if (cfg.inners == null || cfg.inners.Count == 0) cfg.inners = new List<int> { cfg.numeroInner };
            foreach (var n in cfg.inners)
                if (n < 1 || n > 99) throw new Exception("Número de catraca inválido em \"inners\": " + n);
            if (!Path.IsPathRooted(cfg.pastaDados))
                cfg.pastaDados = Path.Combine(Path.GetDirectoryName(Path.GetFullPath(caminho)), cfg.pastaDados);
            Directory.CreateDirectory(cfg.pastaDados);
            return cfg;
        }
    }
}
