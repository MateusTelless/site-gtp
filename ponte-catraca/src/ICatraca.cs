namespace PonteCatraca
{
    public enum TipoLeitura { Identificacao, Giro, Desistencia }

    public class Leitura
    {
        public TipoLeitura tipo;
        public int equipamento;    // número da catraca (Inner nº) onde aconteceu
        public string codigo;      // número enviado pela catraca (cartão, biometria ou teclado)
        public string origem;      // descrição para o log
    }

    /// Todas as catracas que a ponte controla. Hoje: EasyInner (real) e simulada (testes).
    /// Uma implementação só atende várias catracas, porque a EasyInner.dll abre uma porta para todas
    /// e não pode ser usada por duas threads ao mesmo tempo.
    public interface ICatraca
    {
        /// Abre a comunicação. Falha só se nenhuma catraca responder; as outras são tentadas de novo depois.
        void Conectar();
        void Desconectar();

        bool Conectada(int equipamento);

        /// Espera algo acontecer em qualquer catraca. Devolve null se nada aconteceu no tempo.
        Leitura Aguardar(int timeoutMs);

        /// Libera a passagem. Se apenasEntrada for falso, libera os dois sentidos.
        void Liberar(int equipamento, string linha1, string linha2, bool apenasEntrada);

        void Negar(int equipamento, string linha1, string linha2);
    }
}
