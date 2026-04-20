import React, { useState, useEffect } from 'react';
import { initializeApp } from 'firebase/app';
import { getAnalytics } from 'firebase/analytics';
import { getAuth, signInWithCustomToken, signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, collection, doc, setDoc, onSnapshot, addDoc, getDocs, writeBatch, query, where } from 'firebase/firestore';

// ==========================================
// ⚠️ ATENÇÃO: CONFIGURAÇÃO DO SEU FIREBASE
// Substitua os valores abaixo pelas credenciais do seu projeto Firebase
// para que ele funcione corretamente no seu Netlify.
// ==========================================
let firebaseConfig = {
  apiKey: "AIzaSyBY6IHlAXE0YQme9spxrghEV-Jm4Lm9-T4",
  authDomain: "atletismo-a08b7.firebaseapp.com",
  projectId: "atletismo-a08b7",
  storageBucket: "atletismo-a08b7.firebasestorage.app",
  messagingSenderId: "41118687217",
  appId: "1:41118687217:web:53f855bedc342b86aeae50",
  measurementId: "G-JMHHB68SY0"
};

// Lógica de compatibilidade para rodar na nossa pré-visualização (Não apague)
if (typeof __firebase_config !== 'undefined') {
  firebaseConfig = JSON.parse(__firebase_config);
}

// Inicialização do Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// Inicializa o Analytics em segurança (se existir measurementId)
const analytics = typeof window !== "undefined" && firebaseConfig.measurementId ? getAnalytics(app) : null;

const appId = typeof __app_id !== 'undefined' ? __app_id : 'sistema-evento-v1';

// --- Helpers de Banco de Dados ---
// Garante que o Netlify use as coleções reais na raiz do seu Firebase
const getCollectionRef = (colName) => {
  if (typeof __firebase_config !== 'undefined') {
    return collection(db, 'artifacts', appId, 'public', 'data', colName);
  }
  return collection(db, colName);
};

const getDocRef = (colName, docId) => {
  if (typeof __firebase_config !== 'undefined') {
    return doc(db, 'artifacts', appId, 'public', 'data', colName, docId);
  }
  return doc(db, colName, docId);
};

// --- Constantes Fixas ---
const MUNICIPIOS_RO = [
  "Alta Floresta D'Oeste", "Alto Alegre dos Parecis", "Alto Paraíso", "Alvorada D'Oeste",
  "Ariquemes", "Buritis", "Cabixi", "Cacaulândia", "Cacoal", "Campo Novo de Rondônia",
  "Candeias do Jamari", "Castanheiras", "Cerejeiras", "Chupinguaia", "Colorado do Oeste",
  "Corumbiara", "Costa Marques", "Cujubim", "Espigão D'Oeste", "Governador Jorge Teixeira",
  "Guajará-Mirim", "Itapuã do Oeste", "Jaru", "Ji-Paraná", "Machadinho D'Oeste",
  "Ministro Andreazza", "Mirante da Serra", "Monte Negro", "Nova Brasilândia D'Oeste",
  "Nova Mamoré", "Nova União", "Novo Horizonte do Oeste", "Ouro Preto do Oeste",
  "Parecis", "Pimenta Bueno", "Pimenteiras do Oeste", "Porto Velho", "Presidente Médici",
  "Primavera de Rondônia", "Rio Crespo", "Rolim de Moura", "Santa Luzia D'Oeste",
  "São Felipe D'Oeste", "São Francisco do Guaporé", "São Miguel do Guaporé",
  "Seringueiras", "Teixeirópolis", "Theobroma", "Urupá", "Vale do Anari",
  "Vale do Paraíso", "Vilhena"
];

const CATEGORIAS_PADRAO = [
  { nome: "Kids (7-10 anos)", ativa: true },
  { nome: "Mirim (11-17 anos)", ativa: true },
  { nome: "Juvenil (18-23 anos)", ativa: true },
  { nome: "Master (24-44 anos)", ativa: true },
  { nome: "Elite (45+)", ativa: true }
];

const TAMANHOS_CAMISETA = ["PP", "P", "M", "G", "GG", "EG"];

export default function App() {
  const [user, setUser] = useState(null);
  const [view, setView] = useState('atleta'); 
  const [isAdminAutenticado, setIsAdminAutenticado] = useState(false);
  const [senhaInput, setSenhaInput] = useState('');

  // Estados dos Dados
  const [inscricoes, setInscricoes] = useState([]);
  const [modalidades, setModalidades] = useState([{ km: 5, ativa: true }, { km: 10, ativa: true }]);
  const [categorias, setCategorias] = useState(CATEGORIAS_PADRAO);
  const [vagasTotais, setVagasTotais] = useState(100);
  const [telefoneContato, setTelefoneContato] = useState("(69) 00000-0000");
  const [bannerUrl, setBannerUrl] = useState("");
  const [nomeEvento, setNomeEvento] = useState("Meu Evento Esportivo");
  const [dataEvento, setDataEvento] = useState("");
  const [tempoRestante, setTempoRestante] = useState({ dias: 0, horas: 0, min: 0, seg: 0 });

  // Estado do Formulário do Atleta
  const [formAtleta, setFormAtleta] = useState({
    nome: '', cpf: '', dataNascimento: '', sexo: '',
    modalidade: '', categoria: '', camiseta: '', municipio: '',
    equipe: '', whatsapp: ''
  });
  const [erroCpf, setErroCpf] = useState('');
  const [novaModalidade, setNovaModalidade] = useState('');
  const [novaCategoria, setNovaCategoria] = useState('');
  const [editandoModalidade, setEditandoModalidade] = useState({ index: -1, valor: '' });

  // 1. Inicializa Autenticação do Firebase
  useEffect(() => {
    const initAuth = async () => {
      try {
        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
          await signInWithCustomToken(auth, __initial_auth_token);
        } else {
          await signInAnonymously(auth);
        }
      } catch(e) { console.error("Erro de Autenticação", e); }
    };
    initAuth();
    const unsubscribe = onAuthStateChanged(auth, setUser);
    return () => unsubscribe();
  }, []);

  // 2. Busca Dados em Tempo Real (Inscrições e Configurações)
  useEffect(() => {
    if (!user) return;

    // Conexão com as Configurações
    const configRef = getDocRef('config', 'evento-dados');
    const unsubConfig = onSnapshot(configRef, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        if (data.vagasTotais !== undefined) setVagasTotais(data.vagasTotais);
        if (data.telefoneContato !== undefined) setTelefoneContato(data.telefoneContato);
        if (data.bannerUrl !== undefined) setBannerUrl(data.bannerUrl);
        if (data.nomeEvento !== undefined) setNomeEvento(data.nomeEvento);
        if (data.dataEvento !== undefined) setDataEvento(data.dataEvento);
        if (data.modalidades) setModalidades(data.modalidades);
        if (data.categorias) setCategorias(data.categorias);
      }
    }, (err) => console.error("Erro Config:", err));

    // Conexão com a lista de Inscrições na sua coleção "atletas"
    const inscricoesRef = getCollectionRef('atletas');
    const unsubInscricoes = onSnapshot(inscricoesRef, (snap) => {
      const lista = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setInscricoes(lista);
    }, (err) => console.error("Erro Inscrições:", err));

    return () => { unsubConfig(); unsubInscricoes(); };
  }, [user]);

  // Carrega Biblioteca XLSX Dinamicamente
  useEffect(() => {
    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
    script.async = true;
    document.body.appendChild(script);
  }, []);

  // Efeito do Cronômetro Regressivo
  useEffect(() => {
    if (!dataEvento) return;
    const intervalo = setInterval(() => {
      const agora = new Date().getTime();
      const dataAlvo = new Date(dataEvento).getTime();
      const diferenca = dataAlvo - agora;

      if (diferenca < 0) {
        clearInterval(intervalo);
        setTempoRestante({ dias: 0, horas: 0, min: 0, seg: 0 });
      } else {
        setTempoRestante({
          dias: Math.floor(diferenca / (1000 * 60 * 60 * 24)),
          horas: Math.floor((diferenca % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60)),
          min: Math.floor((diferenca % (1000 * 60 * 60)) / (1000 * 60)),
          seg: Math.floor((diferenca % (1000 * 60)) / 1000)
        });
      }
    }, 1000);
    return () => clearInterval(intervalo);
  }, [dataEvento]);

  // --- Funções de Salvar no Firebase ---
  const salvarConfigNoFirebase = async (novosDados) => {
    if (!user) return;
    try {
      const configRef = getDocRef('config', 'evento-dados');
      await setDoc(configRef, novosDados, { merge: true });
    } catch(e) { console.error("Erro ao salvar config:", e); }
  };

  const salvarConfiguracoesGerais = () => {
    salvarConfigNoFirebase({ vagasTotais, telefoneContato, bannerUrl, nomeEvento, dataEvento });
    alert("Configurações Gerais salvas na nuvem com sucesso!");
  };

  // --- Funções de Utilidade e Formulário ---
  const aplicarMascaraCpf = (valor) => {
    return valor.replace(/\D/g, '').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d{1,2})/, '$1-$2').replace(/(-\d{2})\d+?$/, '$1');
  };

  const validarCpf = (cpfStr) => {
    return cpfStr.replace(/\D/g, '').length === 11;
  };

  const gerarNumeroInscricao = (kmModalidade) => {
    const inscritosNaModalidade = inscricoes.filter(i => String(i.modalidade) === String(kmModalidade));
    return String(inscritosNaModalidade.length + 1).padStart(3, '0');
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    if (name === 'cpf') {
      const masked = aplicarMascaraCpf(value);
      setFormAtleta({ ...formAtleta, cpf: masked });
      if (masked.length > 0 && !validarCpf(masked)) {
        setErroCpf('CPF deve conter exatamente 11 números.');
      } else {
        setErroCpf('');
      }
    } else {
      setFormAtleta({ ...formAtleta, [name]: value });
    }
  };

  const handleSubmitInscricao = async (e) => {
    e.preventDefault();
    if (!user) return alert("Erro de conexão. Aguarde e tente novamente.");
    if (inscricoes.length >= vagasTotais) return alert("Desculpe, limite de vagas esgotado!");
    if (!validarCpf(formAtleta.cpf)) return setErroCpf('Corrija o CPF antes de enviar.');

    try {
      const inscricoesRef = getCollectionRef('atletas');
      
      // 🌟 NOVIDADE: O sistema pesquisa se o CPF digitado já existe no banco de dados
      const consultaCpf = query(inscricoesRef, where("cpf", "==", formAtleta.cpf));
      const resultadoConsulta = await getDocs(consultaCpf);

      // Se o resultado não estiver vazio, significa que o CPF já foi usado!
      if (!resultadoConsulta.empty) {
        return alert("ATENÇÃO: Este CPF já possui uma inscrição confirmada neste evento!");
      }

      // Se passou pela verificação acima, cria a inscrição normalmente
      const novaInscricao = {
        ...formAtleta,
        dataHora: new Date().toLocaleString('pt-BR'),
        numero: gerarNumeroInscricao(formAtleta.modalidade)
      };

      await addDoc(inscricoesRef, novaInscricao); // Salva na Nuvem
      
      setFormAtleta({
        nome: '', cpf: '', dataNascimento: '', sexo: '',
        modalidade: '', categoria: '', camiseta: '', municipio: '',
        equipe: '', whatsapp: ''
      });
      alert("Inscrição realizada com sucesso! Seu número é: " + novaInscricao.numero);
      
    } catch(error) {
      console.error(error);
      alert("Falha ao processar inscrição.");
    }
  };

  // --- Handlers de Administração ---
  const handleLoginAdmin = (e) => {
    e.preventDefault();
    if (senhaInput === '685419') {
      setIsAdminAutenticado(true);
      setSenhaInput('');
    } else {
      alert("Senha incorreta.");
    }
  };

  const limparInscricoes = async () => {
    if (window.confirm("Atenção! Isso apagará TODAS as inscrições na nuvem e reiniciará a numeração. Tem certeza?")) {
      if (!user) return;
      try {
        const batch = writeBatch(db);
        const inscricoesRef = getCollectionRef('atletas');
        const snapshot = await getDocs(inscricoesRef);
        snapshot.docs.forEach((doc) => batch.delete(doc.ref));
        await batch.commit();
        alert("Dados apagados com sucesso!");
      } catch(e) { console.error(e); }
    }
  };

  const baixarPlanilha = () => {
    if (inscricoes.length === 0) return alert("Não há inscrições para exportar.");
    if (!window.XLSX) return alert("Aguarde o sistema carregar o motor de planilhas...");

    // 🌟 NOVIDADE: Organiza a lista antes de gerar a planilha
    // Primeiro agrupa pela Modalidade (KM) e depois põe o Número em ordem crescente (1, 2, 3...)
    const inscricoesOrdenadas = [...inscricoes].sort((a, b) => {
      if (a.modalidade !== b.modalidade) {
        return Number(a.modalidade) - Number(b.modalidade);
      }
      return Number(a.numero) - Number(b.numero);
    });

    const dadosPlanilha = inscricoesOrdenadas.map(i => ({
      "DATA/HORA": i.dataHora,
      "NÚMERO": i.numero,
      "NOME COMPLETO": i.nome,
      "CPF": i.cpf,
      "DATA NASCIMENTO": i.dataNascimento ? i.dataNascimento.split('-').reverse().join('/') : '',
      "SEXO": i.sexo,
      "MODALIDADE": i.modalidade ? `${i.modalidade}KM` : "-", 
      "CATEGORIA": i.categoria,
      "TAMANHO CAMISETA": i.camiseta,
      "MUNICÍPIO": i.municipio,
      "EQUIPE": i.equipe || "-",
      "WHATSAPP": i.whatsapp || i.celular 
    }));

    const worksheet = window.XLSX.utils.json_to_sheet(dadosPlanilha);
    const workbook = window.XLSX.utils.book_new();
    window.XLSX.utils.book_append_sheet(workbook, worksheet, "Inscritos");
    window.XLSX.writeFile(workbook, "inscritos_evento.xlsx");
  };

  // Funções de Modalidades
  const adicionarModalidade = () => {
    if (novaModalidade) {
      const novas = [...modalidades, { km: Number(novaModalidade), ativa: true }];
      setModalidades(novas);
      salvarConfigNoFirebase({ modalidades: novas });
      setNovaModalidade('');
    }
  };

  const removerModalidade = (index) => {
    const novas = modalidades.filter((_, i) => i !== index);
    setModalidades(novas);
    salvarConfigNoFirebase({ modalidades: novas });
  };

  const toggleModalidadeAtiva = (index) => {
    const novas = [...modalidades];
    novas[index].ativa = !novas[index].ativa;
    setModalidades(novas);
    salvarConfigNoFirebase({ modalidades: novas });
  };

  const salvarEdicaoModalidade = async () => {
    const kmNovo = parseInt(editandoModalidade.valor);
    if (!kmNovo || isNaN(kmNovo)) return;

    const modalidadeAntiga = modalidades[editandoModalidade.index];
    const kmAntigo = modalidadeAntiga.km;
    
    const novasModalidades = [...modalidades];
    novasModalidades[editandoModalidade.index] = { ...modalidadeAntiga, km: kmNovo };
    setModalidades(novasModalidades);
    salvarConfigNoFirebase({ modalidades: novasModalidades });

    // Atualiza inscrições vinculadas na nuvem
    if (user) {
      try {
        const batch = writeBatch(db);
        const toUpdate = inscricoes.filter(i => String(i.modalidade) === String(kmAntigo));
        toUpdate.forEach(insc => {
          const ref = getDocRef('atletas', insc.id);
          batch.update(ref, { modalidade: kmNovo });
        });
        await batch.commit();
      } catch(e) { console.error(e); }
    }
    setEditandoModalidade({ index: -1, valor: '' });
  };

  // Funções de Categorias
  const adicionarCategoria = () => {
    if (novaCategoria) {
      const novas = [...categorias, { nome: novaCategoria, ativa: true }];
      setCategorias(novas);
      salvarConfigNoFirebase({ categorias: novas });
      setNovaCategoria('');
    }
  };

  const removerCategoria = (index) => {
    const novas = categorias.filter((_, i) => i !== index);
    setCategorias(novas);
    salvarConfigNoFirebase({ categorias: novas });
  };

  const toggleCategoriaAtiva = (index) => {
    const novas = [...categorias];
    novas[index].ativa = !novas[index].ativa;
    setCategorias(novas);
    salvarConfigNoFirebase({ categorias: novas });
  };

  const handleImageUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => setBannerUrl(reader.result);
      reader.readAsDataURL(file);
    }
  };

  // --- Renderização ---
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col font-sans">
      <header className="bg-slate-900 text-white shadow-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <h1 className="text-xl font-bold tracking-tight">Sistema de Inscrição</h1>
            <nav className="flex space-x-4">
              <button onClick={() => setView('atleta')} className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${view === 'atleta' ? 'bg-slate-700 text-white' : 'text-slate-300 hover:bg-slate-800 hover:text-white'}`}>
                Portal do Atleta
              </button>
              <button onClick={() => setView('admin')} className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${view === 'admin' ? 'bg-slate-700 text-white' : 'text-slate-300 hover:bg-slate-800 hover:text-white'}`}>
                Área Restrita (Admin)
              </button>
            </nav>
          </div>
        </div>
      </header>

      <main className="flex-grow p-4 sm:p-6 lg:p-8 flex flex-col items-center">
        
        {/* CORREÇÃO AQUI: max-h-56, object-contain, bg-slate-900 */}
        {bannerUrl && (
          <div className="w-full max-w-4xl mb-8 flex justify-center">
            <img src={bannerUrl} alt="Banner do Evento" className="w-full max-h-56 object-contain bg-slate-900 rounded-xl shadow-md border border-gray-200" onError={(e) => { e.target.style.display = 'none'; }} />
          </div>
        )}

        {/* --- VISÃO DO ATLETA --- */}
        {view === 'atleta' && (
          <div className="w-full max-w-3xl bg-white rounded-xl shadow-lg border border-gray-100 overflow-hidden">
            <div className="bg-blue-600 px-6 py-8 text-center">
              <h2 className="text-3xl font-extrabold text-white">{nomeEvento}</h2>
              {dataEvento && (
                <div className="mt-4 flex justify-center space-x-4">
                  <div className="flex flex-col items-center bg-blue-800 bg-opacity-50 rounded-lg p-2 min-w-[60px] sm:min-w-[70px]"><span className="text-2xl font-bold text-white leading-none">{tempoRestante.dias}</span><span className="text-xs text-blue-200 mt-1 uppercase tracking-wider">Dias</span></div>
                  <div className="flex flex-col items-center bg-blue-800 bg-opacity-50 rounded-lg p-2 min-w-[60px] sm:min-w-[70px]"><span className="text-2xl font-bold text-white leading-none">{tempoRestante.horas}</span><span className="text-xs text-blue-200 mt-1 uppercase tracking-wider">Horas</span></div>
                  <div className="flex flex-col items-center bg-blue-800 bg-opacity-50 rounded-lg p-2 min-w-[60px] sm:min-w-[70px]"><span className="text-2xl font-bold text-white leading-none">{tempoRestante.min}</span><span className="text-xs text-blue-200 mt-1 uppercase tracking-wider">Min</span></div>
                  <div className="flex flex-col items-center bg-blue-800 bg-opacity-50 rounded-lg p-2 min-w-[60px] sm:min-w-[70px]"><span className="text-2xl font-bold text-white leading-none">{tempoRestante.seg}</span><span className="text-xs text-blue-200 mt-1 uppercase tracking-wider">Seg</span></div>
                </div>
              )}
              <p className="mt-5 text-blue-100 text-sm font-medium bg-blue-700 inline-block px-4 py-1.5 rounded-full">
                Vagas disponíveis: {Math.max(vagasTotais - inscricoes.length, 0)}
              </p>
            </div>

            {inscricoes.length >= vagasTotais && (
              <div className="m-6 bg-red-100 border border-red-400 text-red-700 px-4 py-4 rounded-lg text-center shadow-sm" role="alert">
                <strong className="font-bold block text-xl mb-1">Inscrições Encerradas!</strong>
                <span className="block sm:inline">Todas as vagas para este evento já foram preenchidas. Fique atento às próximas edições!</span>
              </div>
            )}

            <form onSubmit={handleSubmitInscricao} className="p-6 sm:p-8 space-y-6">
              <div>
                <h3 className="text-lg font-semibold text-gray-800 border-b pb-2 mb-4">Informações Pessoais</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                  <div className="sm:col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-1">Nome Completo *</label>
                    <input type="text" name="nome" required value={formAtleta.nome} onChange={handleInputChange} onBlur={() => setFormAtleta({...formAtleta, nome: formAtleta.nome.trim()})} className="w-full border border-gray-300 rounded-md shadow-sm p-2.5 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100 disabled:text-gray-500" placeholder="Digite seu nome completo" disabled={inscricoes.length >= vagasTotais} />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">CPF *</label>
                    <input type="text" name="cpf" required value={formAtleta.cpf} onChange={handleInputChange} className={`w-full border rounded-md shadow-sm p-2.5 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100 disabled:text-gray-500 ${erroCpf ? 'border-red-500' : 'border-gray-300'}`} placeholder="000.000.000-00" disabled={inscricoes.length >= vagasTotais} />
                    {erroCpf && <p className="mt-1 text-xs text-red-500">{erroCpf}</p>}
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Data de Nascimento *</label>
                    <input type="date" name="dataNascimento" required min="1927-01-01" value={formAtleta.dataNascimento} onChange={handleInputChange} className="w-full border border-gray-300 rounded-md shadow-sm p-2.5 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100 disabled:text-gray-500" disabled={inscricoes.length >= vagasTotais} />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Sexo *</label>
                    <select name="sexo" required value={formAtleta.sexo} onChange={handleInputChange} className="w-full border border-gray-300 rounded-md shadow-sm p-2.5 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100 disabled:text-gray-500" disabled={inscricoes.length >= vagasTotais}>
                      <option value="">Selecione</option>
                      <option value="M">M</option>
                      <option value="F">F</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Município (Rondônia) *</label>
                    <select name="municipio" required value={formAtleta.municipio} onChange={handleInputChange} className="w-full border border-gray-300 rounded-md shadow-sm p-2.5 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100 disabled:text-gray-500" disabled={inscricoes.length >= vagasTotais}>
                      <option value="">Selecione sua cidade</option>
                      {MUNICIPIOS_RO.map(cidade => <option key={cidade} value={cidade}>{cidade}</option>)}
                    </select>
                  </div>
                </div>
              </div>

              <div>
                <h3 className="text-lg font-semibold text-gray-800 border-b pb-2 mb-4">Informações do Evento</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Modalidade *</label>
                    <select name="modalidade" required value={formAtleta.modalidade} onChange={handleInputChange} className="w-full border border-gray-300 rounded-md shadow-sm p-2.5 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100 disabled:text-gray-500" disabled={inscricoes.length >= vagasTotais}>
                      <option value="">Selecione a distância</option>
                      {modalidades.filter(m => m.ativa).map(mod => <option key={mod.km} value={mod.km}>{mod.km} KM</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Categoria *</label>
                    <select name="categoria" required value={formAtleta.categoria} onChange={handleInputChange} className="w-full border border-gray-300 rounded-md shadow-sm p-2.5 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100 disabled:text-gray-500" disabled={inscricoes.length >= vagasTotais}>
                      <option value="">Selecione sua categoria</option>
                      {categorias.filter(c => c.ativa).map(cat => <option key={cat.nome} value={cat.nome}>{cat.nome}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Tamanho Camiseta *</label>
                    <select name="camiseta" required value={formAtleta.camiseta} onChange={handleInputChange} className="w-full border border-gray-300 rounded-md shadow-sm p-2.5 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100 disabled:text-gray-500" disabled={inscricoes.length >= vagasTotais}>
                      <option value="">Selecione o tamanho</option>
                      {TAMANHOS_CAMISETA.map(tam => <option key={tam} value={tam}>{tam}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">WhatsApp *</label>
                    <input type="text" name="whatsapp" required value={formAtleta.whatsapp} onChange={handleInputChange} className="w-full border border-gray-300 rounded-md shadow-sm p-2.5 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100 disabled:text-gray-500" placeholder="(69) 90000-0000" disabled={inscricoes.length >= vagasTotais} />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-1">Equipe / Assessoria (Opcional)</label>
                    <input type="text" name="equipe" value={formAtleta.equipe} onChange={handleInputChange} className="w-full border border-gray-300 rounded-md shadow-sm p-2.5 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100 disabled:text-gray-500" placeholder="Nome da sua equipe" disabled={inscricoes.length >= vagasTotais} />
                  </div>
                </div>
              </div>

              <div className="pt-4">
                <button type="submit" disabled={inscricoes.length >= vagasTotais} className="w-full bg-blue-600 text-white font-bold py-3 px-4 rounded-md hover:bg-blue-700 transition duration-200 disabled:bg-gray-400 disabled:cursor-not-allowed">
                  {inscricoes.length >= vagasTotais ? 'Vagas Esgotadas' : 'Confirmar Inscrição'}
                </button>
              </div>
            </form>
            <footer className="bg-gray-100 p-4 text-center border-t border-gray-200">
              <p className="text-gray-600 text-sm">Dúvidas sobre o evento? Entre em contato: <strong className="text-gray-800">{telefoneContato}</strong></p>
            </footer>
          </div>
        )}

        {/* --- VISÃO DO ADMINISTRADOR --- */}
        {view === 'admin' && !isAdminAutenticado && (
          <div className="w-full max-w-md bg-white rounded-xl shadow-lg border border-gray-100 p-8 flex flex-col items-center justify-center mt-10 h-fit">
            <h2 className="text-2xl font-bold text-gray-800 mb-2">Área Restrita</h2>
            <p className="text-gray-500 text-sm mb-6 text-center">Digite a senha administrativa para gerenciar o evento.</p>
            <form onSubmit={handleLoginAdmin} className="w-full space-y-4">
              <input type="password" value={senhaInput} onChange={(e) => setSenhaInput(e.target.value)} placeholder="Senha de Acesso" className="w-full border border-gray-300 rounded-md p-3 text-center tracking-widest focus:ring-slate-500 focus:border-slate-500" />
              <button type="submit" className="w-full bg-slate-800 text-white font-bold py-3 rounded-md hover:bg-slate-900 transition">Acessar Painel</button>
            </form>
          </div>
        )}

        {view === 'admin' && isAdminAutenticado && (
          <div className="w-full max-w-7xl space-y-6">
            <div className="flex justify-between items-center bg-white p-4 rounded-lg shadow-sm border border-gray-100">
              <h2 className="text-2xl font-bold text-slate-800">Painel de Controle (Sincronizado na Nuvem)</h2>
              <button onClick={() => setIsAdminAutenticado(false)} className="text-sm text-red-600 hover:underline font-medium">Sair do Painel</button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              
              {/* Gerais */}
              <div className="bg-white p-5 rounded-lg shadow-sm border border-gray-100">
                <h3 className="font-bold text-lg mb-4 text-gray-800 border-b pb-2">Configurações Gerais</h3>
                <div className="space-y-4">
                  <div><label className="block text-sm font-medium text-gray-700 mb-1">Nome do Evento</label><input type="text" value={nomeEvento} onChange={(e) => setNomeEvento(e.target.value)} className="w-full border rounded p-2 focus:ring-slate-500 focus:border-slate-500" /></div>
                  <div><label className="block text-sm font-medium text-gray-700 mb-1">Data e Hora</label><input type="datetime-local" value={dataEvento} onChange={(e) => setDataEvento(e.target.value)} className="w-full border rounded p-2 focus:ring-slate-500 focus:border-slate-500" /></div>
                  <div><label className="block text-sm font-medium text-gray-700 mb-1">Limite de Vagas</label><input type="number" value={vagasTotais} onChange={(e) => setVagasTotais(Number(e.target.value))} className="w-full border rounded p-2 focus:ring-slate-500 focus:border-slate-500" min="1" /></div>
                  <div><label className="block text-sm font-medium text-gray-700 mb-1">Contato (Rodapé)</label><input type="text" value={telefoneContato} onChange={(e) => setTelefoneContato(e.target.value)} className="w-full border rounded p-2 focus:ring-slate-500 focus:border-slate-500" /></div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Banner (URL ou Arquivo)</label>
                    <div className="flex space-x-2">
                      <input type="text" value={bannerUrl} onChange={(e) => setBannerUrl(e.target.value)} placeholder="Cole o link ou Carregue" className="flex-1 border rounded p-2 focus:ring-slate-500 focus:border-slate-500" />
                      <label className="bg-slate-800 text-white px-4 py-2 rounded hover:bg-slate-700 cursor-pointer flex items-center justify-center font-medium transition">📁 <input type="file" accept="image/*" className="hidden" onChange={handleImageUpload} /></label>
                    </div>
                  </div>
                  <button onClick={salvarConfiguracoesGerais} className="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-4 rounded mt-2 transition">Salvar Configurações Gerais</button>
                  <div className="pt-4 border-t flex justify-between"><span className="text-sm text-gray-600">Inscritos Atuais: <strong>{inscricoes.length} / {vagasTotais}</strong></span></div>
                </div>
              </div>

              {/* Modalidades */}
              <div className="bg-white p-5 rounded-lg shadow-sm border border-gray-100">
                <h3 className="font-bold text-lg mb-4 text-gray-800 border-b pb-2">Modalidades (KM)</h3>
                <div className="flex space-x-2 mb-4">
                  <input type="number" value={novaModalidade} onChange={(e) => setNovaModalidade(e.target.value)} placeholder="Ex: 5" className="flex-1 border rounded p-2" min="1" />
                  <button onClick={adicionarModalidade} className="bg-slate-800 text-white px-4 rounded hover:bg-slate-700">Adicionar</button>
                </div>
                <ul className="space-y-2 max-h-60 overflow-y-auto pr-1">
                  {modalidades.map((mod, index) => (
                    <li key={index} className={`flex justify-between items-center p-2 rounded border text-sm ${mod.ativa ? 'bg-gray-50' : 'bg-red-50 border-red-100'}`}>
                      {editandoModalidade.index === index ? (
                        <div className="flex w-full space-x-2">
                           <input type="number" value={editandoModalidade.valor} onChange={(e) => setEditandoModalidade({...editandoModalidade, valor: e.target.value})} className="w-20 border rounded px-1" />
                           <button onClick={salvarEdicaoModalidade} className="text-green-600 font-bold hover:underline">Salvar</button>
                           <button onClick={() => setEditandoModalidade({index: -1, valor: ''})} className="text-gray-500 font-bold hover:underline">Cancelar</button>
                        </div>
                      ) : (
                        <>
                          <span className={`font-medium ${mod.ativa ? 'text-gray-700' : 'text-red-400 line-through'}`}>{mod.km} KM {!mod.ativa && '(Oculta)'}</span>
                          <div className="space-x-3 flex items-center">
                            <button onClick={() => toggleModalidadeAtiva(index)} className={`text-xs font-bold ${mod.ativa ? 'text-orange-500 hover:text-orange-700' : 'text-green-600 hover:text-green-800'}`}>{mod.ativa ? 'Desativar' : 'Ativar'}</button>
                            <button onClick={() => setEditandoModalidade({ index, valor: mod.km })} className="text-blue-600 hover:text-blue-800 text-xs">Editar</button>
                            <button onClick={() => removerModalidade(index)} className="text-red-500 hover:text-red-700 text-xs">Remover</button>
                          </div>
                        </>
                      )}
                    </li>
                  ))}
                </ul>
              </div>

              {/* Categorias */}
              <div className="bg-white p-5 rounded-lg shadow-sm border border-gray-100">
                <h3 className="font-bold text-lg mb-4 text-gray-800 border-b pb-2">Categorias de Idade</h3>
                <div className="flex space-x-2 mb-4">
                  <input type="text" value={novaCategoria} onChange={(e) => setNovaCategoria(e.target.value)} placeholder="Ex: Master B" className="flex-1 border rounded p-2" />
                  <button onClick={adicionarCategoria} className="bg-slate-800 text-white px-4 rounded hover:bg-slate-700">Adicionar</button>
                </div>
                <ul className="space-y-2 max-h-60 overflow-y-auto pr-1">
                  {categorias.map((cat, index) => (
                    <li key={index} className={`flex justify-between items-center p-2 rounded border text-sm ${cat.ativa ? 'bg-gray-50' : 'bg-red-50 border-red-100'}`}>
                      <span className={`font-medium ${cat.ativa ? 'text-gray-700' : 'text-red-400 line-through'}`}>{cat.nome} {!cat.ativa && '(Oculta)'}</span>
                      <div className="space-x-3 flex items-center">
                        <button onClick={() => toggleCategoriaAtiva(index)} className={`text-xs font-bold ${cat.ativa ? 'text-orange-500 hover:text-orange-700' : 'text-green-600 hover:text-green-800'}`}>{cat.ativa ? 'Desativar' : 'Ativar'}</button>
                        <button onClick={() => removerCategoria(index)} className="text-red-500 hover:text-red-700 text-xs">Remover</button>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            {/* Tabela de Inscritos */}
            <div className="flex justify-between items-center mt-8">
              <h3 className="text-xl font-bold text-slate-800">Inscritos Cadastrados</h3>
              <div className="space-x-3">
                <button onClick={baixarPlanilha} className="bg-green-600 text-white px-4 py-2 rounded shadow hover:bg-green-700 font-medium transition">⬇ Baixar Planilha (.xlsx)</button>
                <button onClick={limparInscricoes} className="bg-red-100 text-red-600 border border-red-200 px-4 py-2 rounded shadow hover:bg-red-600 hover:text-white font-medium transition">🗑 Limpar Inscrições</button>
              </div>
            </div>

            <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200 text-sm">
                  <thead className="bg-slate-100">
                    <tr>
                      <th className="px-4 py-3 text-left font-bold text-slate-600 uppercase tracking-wider">Data/Hora</th>
                      <th className="px-4 py-3 text-left font-bold text-slate-600 uppercase tracking-wider">Número</th>
                      <th className="px-4 py-3 text-left font-bold text-slate-600 uppercase tracking-wider">Nome Completo</th>
                      <th className="px-4 py-3 text-left font-bold text-slate-600 uppercase tracking-wider">CPF</th>
                      <th className="px-4 py-3 text-left font-bold text-slate-600 uppercase tracking-wider">Data Nasc.</th>
                      <th className="px-4 py-3 text-left font-bold text-slate-600 uppercase tracking-wider">Sexo</th>
                      <th className="px-4 py-3 text-left font-bold text-slate-600 uppercase tracking-wider">Modalidade</th>
                      <th className="px-4 py-3 text-left font-bold text-slate-600 uppercase tracking-wider">Categoria</th>
                      <th className="px-4 py-3 text-left font-bold text-slate-600 uppercase tracking-wider">Tamanho</th>
                      <th className="px-4 py-3 text-left font-bold text-slate-600 uppercase tracking-wider">Município</th>
                      <th className="px-4 py-3 text-left font-bold text-slate-600 uppercase tracking-wider">Equipe</th>
                      <th className="px-4 py-3 text-left font-bold text-slate-600 uppercase tracking-wider">WhatsApp</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {inscricoes.length === 0 ? (
                      <tr><td colSpan="12" className="px-4 py-8 text-center text-gray-500 italic">Nenhum atleta inscrito até o momento.</td></tr>
                    ) : (
                      inscricoes.map((insc, idx) => (
                        <tr key={idx} className="hover:bg-gray-50">
                          <td className="px-4 py-3 whitespace-nowrap text-gray-600">{insc.dataHora}</td>
                          <td className="px-4 py-3 whitespace-nowrap font-bold text-slate-800">{insc.numero}</td>
                          <td className="px-4 py-3 whitespace-nowrap font-medium text-gray-900">{insc.nome}</td>
                          <td className="px-4 py-3 whitespace-nowrap text-gray-600">{insc.cpf}</td>
                          <td className="px-4 py-3 whitespace-nowrap text-gray-600">{insc.dataNascimento ? insc.dataNascimento.split('-').reverse().join('/') : ''}</td>
                          <td className="px-4 py-3 whitespace-nowrap text-gray-600">{insc.sexo}</td>
                          <td className="px-4 py-3 whitespace-nowrap font-medium text-blue-600">{insc.modalidade ? `${insc.modalidade} KM` : '-'}</td>
                          <td className="px-4 py-3 whitespace-nowrap text-gray-600">{insc.categoria}</td>
                          <td className="px-4 py-3 whitespace-nowrap font-bold text-gray-700">{insc.camiseta}</td>
                          <td className="px-4 py-3 whitespace-nowrap text-gray-600">{insc.municipio}</td>
                          <td className="px-4 py-3 whitespace-nowrap text-gray-600">{insc.equipe || '-'}</td>
                          <td className="px-4 py-3 whitespace-nowrap text-gray-600">{insc.whatsapp || insc.celular}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}