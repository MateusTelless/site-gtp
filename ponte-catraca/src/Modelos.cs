using System;
using System.Collections.Generic;

namespace PonteCatraca
{
    public class Pessoa
    {
        public string codigo;
        public string nome;
        public bool liberado;
        public string mensagem;   // frase do visor quando bloqueado (hoje sempre "VER NA RECEPCAO")
        public string motivo;     // só para o registro: pagamento_atrasado, matricula_inativa, codigo_duplicado
    }

    public class ListaLiberados
    {
        public string geradoEm;
        public List<Pessoa> pessoas = new List<Pessoa>();
    }

    public class Evento
    {
        public string id;
        public string codigo;
        public string dataHora;
        public string resultado;   // liberado | negado | nao_cadastrado | giro | desistencia
        public string motivo;
        public int equipamento;

        public static Evento Novo(string codigo, string resultado, string motivo, int equipamento)
        {
            return new Evento
            {
                id = Guid.NewGuid().ToString(),
                codigo = codigo,
                dataHora = DateTimeOffset.Now.ToString("yyyy-MM-ddTHH:mm:sszzz"),
                resultado = resultado,
                motivo = motivo ?? "",
                equipamento = equipamento
            };
        }
    }

    public class Decisao
    {
        public bool liberar;
        public string resultado;   // liberado | negado | nao_cadastrado
        public string nome;        // 2ª linha do visor quando liberado
        public string mensagem;    // 1ª linha do visor quando bloqueado
        public string motivo;      // vai para o registro, não aparece no visor
    }
}
