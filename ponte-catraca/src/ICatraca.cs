namespace PonteCatraca
{
    public enum TipoLeitura { Identificacao, Giro, Desistencia }

    public class Leitura
    {
        public TipoLeitura tipo;
        public string codigo;      // número enviado pela catraca (cartão, biometria ou teclado)
        public string origem;      // descrição para o log
    }

    /// Qualquer catraca que a ponte saiba controlar. Hoje: EasyInner (real) e simulada (testes).
    public interface ICatraca
    {
        void Conectar();
        void Desconectar();

        /// Espera algo acontecer na catraca. Devolve null se nada aconteceu no tempo.
        Leitura Aguardar(int timeoutMs);

        /// Libera a passagem. Se apenasEntrada for falso, libera os dois sentidos.
        void Liberar(string linha1, string linha2, bool apenasEntrada);

        void Negar(string linha1, string linha2);
    }
}
