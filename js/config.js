/*
  Configuração do Supabase (banco de dados + login).
  Pegue esses dois valores em: supabase.com → seu projeto → Project Settings → API.
  - supabaseUrl: "Project URL"
  - supabaseAnonKey: a "Publishable key" (sb_publishable_...) ou a antiga chave "anon public"
  A chave "anon" pode ficar no site: quem protege os dados são as regras do arquivo supabase/schema.sql.
  NUNCA coloque aqui a "Secret key" (sb_secret_...) nem a antiga "service_role".
*/
window.EAT_CONFIG = {
  supabaseUrl: 'https://ecarphadepygubfynyps.supabase.co',
  supabaseAnonKey: 'sb_publishable_EzDzmLzDH03YFM950PCLtQ_xjjs3Awg',
  // Funções de IA (leitura de laudo, avaliação integrada, estimativa por foto).
  // Para ativar: cadastre o segredo ANTHROPIC_API_KEY no Supabase e mude para true.
  iaAtiva: false
};
