# ëat · Anamnese interativa

O sistema tem duas telas:

| Arquivo | Para quem | O que faz |
|---|---|---|
| `index.html` | Visitantes | Página inicial: apresenta o ëat e leva para criar conta ou entrar. |
| `anamnese.html` | Paciente | Questionário interativo. Pelo link da nutri, as respostas vão direto para o banco. |
| `confirmar.html` | Paciente | Confirmação de consulta pelo link do WhatsApp. |
| `painel.html` | Nutricionista | Login com e-mail e senha, link pessoal para pacientes, lista e ficha de cada anamnese, PDF. |

As contas e as respostas ficam no **Supabase** (banco de dados + login). O plano gratuito dá para começar.

---

## 1. Criar o projeto no Supabase (uma vez)

1. Entre em **supabase.com** e crie uma conta.
2. Clique em **New project**. Escolha um nome (ex.: `eat-anamnese`) e a região **South America (São Paulo)**. Guarde a senha do banco que ele pedir.
3. Espere o projeto ficar pronto (1 a 2 minutos).

## 2. Criar as tabelas e as regras de segurança

1. No menu da esquerda, abra **SQL Editor** → **New query**.
2. Abra o arquivo `supabase/schema.sql`, copie **tudo** e cole lá.
3. Clique em **Run**. Deve aparecer "Success".

Isso cria:
- `perfis`: o nome e o WhatsApp de cada nutri.
- `anamneses`: as respostas de cada paciente.
- As regras que garantem que **cada nutri só vê as próprias pacientes**. A paciente só consegue enviar respostas, nunca ler.

Depois, rode também o arquivo `supabase/fase1.sql` (do mesmo jeito). Ele cria:
- a **ficha da paciente** (`pacientes`), que junta anamneses, avaliações, cálculos, exames e fotos;
- os **registros** (`registros`);
- a pasta privada **arquivos** no Storage, para fotos e PDFs de exames. Cada nutri só acessa a própria pasta.

Por último, rode `supabase/fase2.sql`. Ele libera os registros de **avaliação infantil** e **gestação**.

Depois, rode `supabase/fase4.sql`. Ele cria a **biblioteca** da nutri (receitas, orientações, fórmulas, farmácias, modelos de plano, refeições favoritas, alimentos próprios, medidas caseiras e equivalentes) e libera os registros de plano, suplementos e orientações.

**Fonte dos alimentos:** Tabela Brasileira de Composição de Alimentos (TACO), 4ª edição revisada e ampliada, NEPA/UNICAMP, 2011 — 597 alimentos, valores por 100 g. Arquivo `js/taco.js`.

### Gestão do consultório (fase 5)

1. Rode `supabase/fase5.sql`. Ele cria a **agenda**, o **financeiro**, os campos de papel timbrado no perfil e as funções de confirmação pela paciente e de agenda para o Google.
2. Em **Edge Functions**, crie a função **`agenda-ics`** com `supabase/functions/agenda-ics/index.ts` e desligue **Verify JWT** nas configurações dela (o Google não faz login; o link secreto identifica a nutri).
3. Publique também `confirmar.html` junto com o site: é a página onde a paciente confirma a consulta.

A teleconsulta usa o **Google Meet**: salve um link fixo de reunião no Perfil (ou cole um link próprio em cada consulta online).

### Funções de IA (fase 3)

1. Rode `supabase/fase3.sql`.
2. Em **Edge Functions → Deploy a new function → Via editor**, crie a função **`ia`** com o conteúdo de `supabase/functions/ia/index.ts`. Em **Settings** da função, desligue **Verify JWT with legacy secret** (a função confere o login por conta própria).
3. Crie uma chave em **console.anthropic.com** (API Keys). Em **Edge Functions → Secrets**, adicione o segredo `ANTHROPIC_API_KEY` com essa chave.
4. Em `js/config.js`, mude `iaAtiva: false` para `iaAtiva: true`. Enquanto estiver `false`, nenhum botão ou aba de IA aparece no painel.

A chave fica só no servidor do Supabase; o site nunca a vê. Cada análise tem custo por uso na sua conta da Anthropic.

## 3. Ligar o site ao Supabase

1. No Supabase, vá em **Project Settings → API**.
2. Copie a **Project URL** e a chave **anon public**.
3. Cole as duas em `js/config.js`:

```js
window.EAT_CONFIG = {
  supabaseUrl: 'https://xxxxxxxx.supabase.co',
  supabaseAnonKey: 'eyJhbGciOi...'
};
```

> A chave `anon` pode ficar no site, porque quem protege os dados são as regras do passo 2. **Nunca** use a chave `service_role` no site.

## 4. Configurar os e-mails de login

Em **Authentication → URL Configuration**:
- **Site URL**: o endereço do painel. Exemplo: `https://seusite.com/painel.html`.
- **Redirect URLs**: adicione o mesmo endereço. Para testar no computador, adicione também `http://localhost:5173/painel.html`.

Isso faz os links de **confirmar e-mail** e **recuperar senha** voltarem para o painel.

Opcional: em **Authentication → Email Templates** dá para traduzir os e-mails para português.

> O envio de e-mails do plano gratuito tem limite baixo (poucos por hora). Para uso real, configure um SMTP próprio em **Authentication → SMTP Settings** (ex.: Resend, Brevo).

## 5. Publicar o site

A pasta `anamnese/` é um site estático: não precisa de servidor próprio. Algumas opções gratuitas:
- **Netlify**: arraste a pasta `anamnese` em app.netlify.com/drop.
- **Vercel** ou **GitHub Pages**.

Depois de publicar, atualize a **Site URL** do passo 4 com o endereço real.

## 6. Usar

1. A nutri abre `painel.html` → **Criar conta** → confirma o e-mail → entra.
2. No painel, copia o **link para pacientes** (pode colocar o nome da paciente) e manda pelo WhatsApp.
3. A paciente responde, marca a autorização e toca em **Enviar**.
4. A anamnese aparece no painel com o selo **nova**. Lá a nutri vê o resumo, os pontos de atenção e as respostas completas, e pode baixar o PDF.

---

## Testar no computador

Com Python instalado, na pasta do projeto:

```
python -m http.server 5173 --directory anamnese
```

Abra `http://localhost:5173/painel.html`.

## Privacidade (LGPD)

As respostas são **dados de saúde**, que a LGPD trata como dados sensíveis. Por isso o sistema:
- pede a **autorização da paciente** antes de enviar;
- deixa cada nutri ver só as próprias pacientes;
- permite **excluir** uma anamnese no painel.

Vale ter uma política de privacidade no site e combinar com as pacientes por quanto tempo os dados ficam guardados.
