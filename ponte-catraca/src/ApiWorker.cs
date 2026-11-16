using System;
using System.Collections.Generic;
using System.Net;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Text;
using System.Web.Script.Serialization;

namespace PonteCatraca
{
    public class ApiWorker
    {
        readonly HttpClient http;
        readonly string baseUrl;
        readonly JavaScriptSerializer json = new JavaScriptSerializer { MaxJsonLength = int.MaxValue };

        public ApiWorker(Config cfg)
        {
            // .NET Framework não liga TLS 1.2 sozinho; a Cloudflare exige.
            ServicePointManager.SecurityProtocol |= SecurityProtocolType.Tls12;
            baseUrl = cfg.urlApi.TrimEnd('/');
            http = new HttpClient { Timeout = TimeSpan.FromSeconds(20) };
            http.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", cfg.token);
            http.DefaultRequestHeaders.UserAgent.ParseAdd("ponte-catraca/" + Programa.Versao);
        }

        /// Devolve a lista e o JSON original (para gravar em disco do jeito que veio).
        public ListaLiberados BaixarLiberados(out string jsonOriginal)
        {
            var resp = http.GetAsync(baseUrl + "/liberados").Result;
            jsonOriginal = resp.Content.ReadAsStringAsync().Result;
            if (!resp.IsSuccessStatusCode)
                throw new Exception("GET /liberados respondeu " + (int)resp.StatusCode + ": " + Cortar(jsonOriginal));
            var lista = json.Deserialize<ListaLiberados>(jsonOriginal);
            if (lista == null || lista.pessoas == null)
                throw new Exception("Resposta de /liberados sem o campo 'pessoas'.");
            return lista;
        }

        public void EnviarEventos(List<Evento> eventos)
        {
            Postar("/eventos", new { eventos = eventos });
        }

        public void EnviarStatus(object status)
        {
            Postar("/status", status);
        }

        void Postar(string caminho, object corpo)
        {
            var conteudo = new StringContent(json.Serialize(corpo), Encoding.UTF8, "application/json");
            var resp = http.PostAsync(baseUrl + caminho, conteudo).Result;
            if (!resp.IsSuccessStatusCode)
                throw new Exception("POST " + caminho + " respondeu " + (int)resp.StatusCode + ": "
                    + Cortar(resp.Content.ReadAsStringAsync().Result));
        }

        static string Cortar(string s)
        {
            if (s == null) return "";
            return s.Length > 200 ? s.Substring(0, 200) + "..." : s;
        }
    }
}
