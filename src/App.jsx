import React, { useState, useEffect } from 'react';
import { initializeApp } from 'firebase/app';
import { getAnalytics } from 'firebase/analytics';
import { getAuth, signInWithCustomToken, signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, collection, doc, setDoc, onSnapshot, addDoc, getDocs, writeBatch, query, where, deleteDoc } from 'firebase/firestore';

// ==========================================
// ⚠️ ATENÇÃO: CONFIGURAÇÃO DO SEU FIREBASE
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

if (typeof __firebase_config !== 'undefined') {
  firebaseConfig = JSON.parse(__firebase_config);
}

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const analytics = typeof window !== "undefined" && firebaseConfig.measurementId ? getAnalytics(app) : null;
const appId = typeof __app_id !== 'undefined' ? __app_id : 'sistema-evento-v1';

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

// --- Funções Auxiliares (Fora do Componente) ---
const limparCpf = (cpf) => cpf.replace(/\D/g, ''); 
const formatarCpf = (cpf) => {
  const limpo = limparCpf(cpf);
  if (limpo.length !== 11) return cpf; 
  return limpo.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
};

const formatarTelefone = (valor) => {
  let v = valor.replace(/\D/g, ''); 
  if (v.length > 11) v = v.substring(0, 11); 
  v = v.replace(/^(\d{2})(\d)/g, '($1) $2'); 
  v = v.replace(/(\d{5})(\d)/, '$1-$2'); 
  return v;
};

const calcularIdade = (dataNascimentoString) => {
  const hoje = new Date();
  const nasc = new Date(dataNascimentoString + 'T00:00:00'); 
  let idade = hoje.getFullYear() - nasc.getFullYear();
  const m = hoje.getMonth() - nasc.getMonth();
  if (m < 0 || (m === 0 && hoje.getDate() < nasc.getDate())) {
    idade--; 
  }
  return idade;
};

const validarIdadeCategoria = (idade, nomeCategoria) => {
  const matchRange = nomeCategoria.match(/\((\d+)\s*-\s*(\d+)\s*anos?\)/i);
  if (matchRange) {
    return idade >= parseInt(matchRange[1]) && idade <= parseInt(matchRange[2]);
  }
  const matchPlus = nomeCategoria.match(/\((\d+)\s*\+\)/);
  if (matchPlus) {
    return idade >= parseInt(matchPlus[1]);
  }
  return true; 
};

export default function App() {
  const [user, setUser] = useState(null);
  const [view, setView] = useState('atleta'); 
  const [isAdminAutenticado, setIsAdminAutenticado] = useState(false);
  const [senhaInput, setSenhaInput] = useState('');

  const [inscricoes, setInscricoes] = useState([]);
  const [modalidades, setModalidades] = useState([{ km: 5, ativa: true }, { km: 10, ativa: true }]);
  const [categorias, setCategorias] = useState(CATEGORIAS_PADRAO);
  const [vagasTotais, setVagasTotais] = useState(100);
  const [telefoneContato, setTelefoneContato] = useState("(69) 00000-0000");
  const [bannerUrl, setBannerUrl] = useState("");
  const [nomeEvento, setNomeEvento] = useState("Meu Evento Esportivo");
  const [dataEvento, setDataEvento] = useState("");
  const [tempoRestante, setTempoRestante] = useState({ dias: 0, horas: 0, min: 0, seg: 0 });

  const [isEventoPago, setIsEventoPago] = useState(false);
  const [valorInscricao, setValorInscricao] = useState("");
  const [chavePix, setChavePix] = useState("");

  const [formAtleta, setFormAtleta] = useState({
    nome: '', cpf: '', dataNascimento: '', sexo: '',
    modalidade: '', categoria: '', camiseta: '', municipio: '', equipe: '', whatsapp: ''
  });
  const [erroCpf, setErroCpf] = useState('');
  const [inscricaoSucesso, setInscricaoSucesso] = useState(null);

  const [termoConsulta, setTermoConsulta] = useState('');
  const [resultadoConsulta, setResultadoConsulta] = useState(null);
  const [mensagemConsulta, setMensagemConsulta] = useState('');

  const [mostrarFormAdmin, setMostrarFormAdmin] = useState(false);
  const [formAdmin, setFormAdmin] = useState({
    nome: '', cpf: '', dataNascimento: '', sexo: '',
    modalidade: '', categoria: '', camiseta: '', municipio: '', equipe: '', whatsapp: ''
  });

  const [novaModalidade, setNovaModalidade] = useState('');
  const [novaCategoria, setNovaCategoria] = useState('');
  const [editandoModalidade, setEditandoModalidade] = useState({ index: -1, valor: '' });

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

  useEffect(() => {
    if (!user) return;
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
        if (data.isEventoPago !== undefined) setIsEventoPago(data.isEventoPago);
        if (data.valorInscricao !== undefined) setValorInscricao(data.valorInscricao);
        if (data.chavePix !== undefined) setChavePix(data.chavePix);
      }
    }, (err) => console.error("Erro Config:", err));

    const inscricoesRef = getCollectionRef('atletas');
    const unsubInscricoes = onSnapshot(inscricoesRef, (snap) => {
      const lista = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setInscricoes(lista);
    }, (err) => console.error("Erro Inscrições:", err));

    return () => { unsubConfig(); unsubInscricoes(); };
  }, [user]);

  useEffect(() => {
    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
    script.async = true;
    document.body.appendChild(script);
  }, []);

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

  const salvarConfigNoFirebase = async (novosDados) => {
    if (!user) return;
    try {
      const configRef = getDocRef('config', 'evento-dados');
      await setDoc(configRef, novosDados, { merge: true });
    } catch(e) { console.error("Erro ao salvar config:", e); }
  };

  const salvarConfiguracoesGerais = () => {
    salvarConfigNoFirebase({ vagasTotais, telefoneContato, bannerUrl, nomeEvento, dataEvento, isEventoPago, valorInscricao, chavePix });
    alert("Configurações Gerais salvas na nuvem com sucesso!");
  };

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
    } else if (name === 'nome') {
      const nomeApenasLetras = value.replace(/[^a-zA-ZÀ-ÿ\s]/g, '');
      setFormAtleta({ ...formAtleta, [name]: nomeApenasLetras });
    } else if (name === 'whatsapp') {
      setFormAtleta({ ...formAtleta, [name]: formatarTelefone(value) });
    } else if (name === 'dataNascimento') {
      // --- NOVA LÓGICA: AUTO SELEÇÃO DE CATEGORIA ---
      let categoriaAutomatica = '';
      if (value) {
        const idadeAtleta = calcularIdade(value);
        const categoriaEncontrada = categorias.find(cat => cat.ativa && validarIdadeCategoria(idadeAtleta, cat.nome));
        
        if (categoriaEncontrada) {
          categoriaAutomatica = categoriaEncontrada.nome;
        } else {
          alert(`Sua idade exata hoje é ${idadeAtleta} anos. Você não se enquadra em nenhuma categoria ativa prevista para este evento.`);
        }
      }
      setFormAtleta({ ...formAtleta, dataNascimento: value, categoria: categoriaAutomatica });
    } else {
      setFormAtleta({ ...formAtleta, [name]: value });
    }
  };

  const handleAdminInputChange = (e) => {
    const { name, value } = e.target;
    if (name === 'cpf') {
      const masked = aplicarMascaraCpf(value);
      setFormAdmin({ ...formAdmin, cpf: masked });
    } else if (name === 'nome') {
      const nomeApenasLetras = value.replace(/[^a-zA-ZÀ-ÿ\s]/g, '');
      setFormAdmin({ ...formAdmin, [name]: nomeApenasLetras });
    } else if (name === 'whatsapp') {
      setFormAdmin({ ...formAdmin, [name]: formatarTelefone(value) });
    } else {
      setFormAdmin({ ...formAdmin, [name]: value });
    }
  };

  const handleSubmitInscricao = async (e) => {
    e.preventDefault();
    const cpfLimpo = limparCpf(formAtleta.cpf);
    if (!user) return alert("Erro de conexão. Aguarde e tente novamente.");
    if (inscricoes.length >= vagasTotais) return alert("Desculpe, limite de vagas esgotado!");
    if (!validarCpf(formAtleta.cpf)) return setErroCpf('Corrija o CPF antes de enviar.');

    const anoNascimento = parseInt(formAtleta.dataNascimento.substring(0, 4));
    const anoAtual = new Date().getFullYear();
    if (anoNascimento < 1900 || anoNascimento > anoAtual) {
      return alert("Atenção: Por favor, insira um ano de nascimento válido.");
    }

    if (!formAtleta.categoria) {
      return alert("Inscrição bloqueada: A sua idade não se enquadra em nenhuma categoria ativa neste evento.");
    }

    if (formAtleta.dataNascimento && formAtleta.categoria) {
      const idadeAtleta = calcularIdade(formAtleta.dataNascimento);
      const idadeValida = validarIdadeCategoria(idadeAtleta, formAtleta.categoria);
      if (!idadeValida) {
        return alert(`Atenção: Sua idade exata hoje é ${idadeAtleta} anos. Esta idade não é permitida para a categoria "${formAtleta.categoria}".`);
      }
    }

    try {
      const inscricoesRef = getCollectionRef('atletas');
      const consultaCpf = query(inscricoesRef, where("cpfLimpo", "==", cpfLimpo));
      const resultadoConsulta = await getDocs(consultaCpf);

      if (!resultadoConsulta.empty) {
        return alert("ATENÇÃO: Este CPF já possui uma inscrição confirmada neste evento!");
      }

      const novaInscricao = {
        ...formAtleta,
        cpf: formatarCpf(formAtleta.cpf), 
        cpfLimpo: cpfLimpo,               
        dataHora: new Date().toLocaleString('pt-BR'),
        numero: gerarNumeroInscricao(formAtleta.modalidade)
      };

      await addDoc(inscricoesRef, novaInscricao); 
      setInscricaoSucesso(novaInscricao);
      setFormAtleta({
        nome: '', cpf: '', dataNascimento: '', sexo: '',
        modalidade: '', categoria: '', camiseta: '', municipio: '', equipe: '', whatsapp: ''
      });
      
    } catch(error) {
      console.error(error);
      alert("Falha ao processar inscrição.");
    }
  };

  const handleConsultar = (e) => {
    e.preventDefault();
    if (!termoConsulta.trim()) return;

    const termo = termoConsulta.toLowerCase().trim();
    const apenasNumeros = termo.replace(/\D/g, '');

    const encontrados = inscricoes.filter(atleta => {
      const matchCpf = (apenasNumeros.length === 11 && atleta.cpfLimpo === apenasNumeros);
      const matchNome = atleta.nome.toLowerCase().includes(termo);
      return matchCpf || matchNome;
    });

    if (encontrados.length > 0) {
      setResultadoConsulta(encontrados);
      setMensagemConsulta('');
    } else {
      setResultadoConsulta(null);
      setMensagemConsulta('Nenhuma inscrição foi encontrada com este Nome ou CPF.');
    }
  };

  const handleSubmitAdmin = async (e) => {
    e.preventDefault();
    const cpfLimpo = limparCpf(formAdmin.cpf);
    if (!validarCpf(formAdmin.cpf)) return alert('Corrija o CPF antes de enviar.');

    const anoNascimento = parseInt(formAdmin.dataNascimento.substring(0, 4));
    const anoAtual = new Date().getFullYear();
    if (anoNascimento < 1900 || anoNascimento > anoAtual) {
      return alert("Ano de nascimento inválido.");
    }

    try {
      const inscricoesRef = getCollectionRef('atletas');
      const consultaCpf = query(inscricoesRef, where("cpfLimpo", "==", cpfLimpo));
      const resultadoConsulta = await getDocs(consultaCpf);

      if (!resultadoConsulta.empty) {
        return alert("Erro: Este CPF já está inscrito!");
      }

      const novaInscricao = {
        ...formAdmin,
        cpf: formatarCpf(formAdmin.cpf), 
        cpfLimpo: cpfLimpo,               
        dataHora: new Date().toLocaleString('pt-BR') + ' (Manual)',
        numero: gerarNumeroInscricao(formAdmin.modalidade)
      };

      await addDoc(inscricoesRef, novaInscricao); 
      setFormAdmin({
        nome: '', cpf: '', dataNascimento: '', sexo: '',
        modalidade: '', categoria: '', camiseta: '', municipio: '', equipe: '', whatsapp: ''
      });
      setMostrarFormAdmin(false); 
      alert("Inscrição manual adicionada com sucesso! Número: " + novaInscricao.numero);
    } catch(error) {
      console.error(error);
      alert("Falha ao processar inscrição manual.");
    }
  };

  const removerInscricaoIndividual = async (id, nome) => {
    if (window.confirm(`ATENÇÃO: Tem certeza que deseja excluir permanentemente a inscrição de ${nome}?`)) {
      try {
        await deleteDoc(getDocRef('atletas', id));
      } catch (error) {
        console.error(error);
        alert("Erro ao tentar excluir a inscrição.");
      }
    }
  };

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

    const inscricoesOrdenadas = [...inscricoes].sort((a, b) => {
      if (a.modalidade !== b.modalidade) return Number(a.modalidade) - Number(b.modalidade);
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

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col font-sans">
      <header className="bg-slate-900 text-white shadow-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <h1 className="text-xl font-bold tracking-tight">Sistema de Inscrição</h1>
            <nav className="flex space-x-2 sm:space-x-4">
              <button onClick={() => {setView('atleta'); setInscricaoSucesso(null);}} className={`px-2 sm:px-3 py-2 rounded-md text-xs sm:text-sm font-medium transition-colors ${view === 'atleta' ? 'bg-slate-700 text-white' : 'text-slate-300 hover:bg-slate-800 hover:text-white'}`}>
                Inscrever-se
              </button>
              <button onClick={() => {setView('consulta'); setResultadoConsulta(null); setTermoConsulta(''); setMensagemConsulta('');}} className={`px-2 sm:px-3 py-2 rounded-md text-xs sm:text-sm font-medium transition-colors ${view === 'consulta' ? 'bg-slate-700 text-white' : 'text-slate-300 hover:bg-slate-800 hover:text-white'}`}>
                Consultar Inscrição
              </button>
              <button onClick={() => setView('admin')} className={`px-2 sm:px-3 py-2 rounded-md text-xs sm:text-sm font-medium transition-colors ${view === 'admin' ? 'bg-slate-700 text-white' : 'text-slate-300 hover:bg-slate-800 hover:text-white'}`}>
                Área Restrita
              </button>
            </nav>
          </div>
        </div>
      </header>

      <main className="flex-grow p-4 sm:p-6 lg:p-8 flex flex-col items-center">
        {bannerUrl && (
          <div className="w-full max-w-4xl mb-8 flex justify-center">
            <img src={bannerUrl} alt="Banner do Evento" className="w-full max-h-56 object-contain bg-slate-900 rounded-xl shadow-md border border-gray-200" onError={(e) => { e.target.style.display = 'none'; }} />
          </div>
        )}

        {/* --- VISÃO DE CONSULTA DE INSCRIÇÃO --- */}
        {view === 'consulta' && (
          <div className="w-full max-w-3xl bg-white rounded-xl shadow-lg border border-gray-100 overflow-hidden p-6 sm:p-8 mt-4">
             <h2 className="text-2xl font-bold text-slate-800 mb-6 border-b pb-2">Consultar Inscrição</h2>
             <form onSubmit={handleConsultar} className="flex flex-col sm:flex-row gap-4 mb-6">
                <input
                  type="text"
                  placeholder="Digite seu Nome completo ou CPF"
                  value={termoConsulta}
                  onChange={(e) => setTermoConsulta(e.target.value)}
                  className="flex-1 border border-gray-300 rounded-md p-3 focus:ring-blue-500 focus:border-blue-500"
                />
                <button type="submit" className="bg-slate-800 text-white font-bold py-3 px-6 rounded-md hover:bg-slate-900 transition shadow">
                  Buscar Atleta
                </button>
             </form>

             {mensagemConsulta && (
               <div className="bg-red-50 border border-red-200 text-red-700 p-4 rounded-md text-center font-medium shadow-sm">{mensagemConsulta}</div>
             )}

             {resultadoConsulta && resultadoConsulta.length > 0 && (
               <div className="space-y-4">
                 {resultadoConsulta.map((atleta, idx) => (
                   <div key={idx} className="bg-blue-50 border border-blue-200 rounded-lg p-5 shadow-sm transition transform hover:scale-[1.01]">
                     <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                        <div>
                          <h4 className="font-bold text-xl text-slate-800 mb-1">{atleta.nome}</h4>
                          <p className="text-gray-700 text-sm">Categoria: <strong className="text-blue-700">{atleta.categoria}</strong></p>
                          <p className="text-gray-700 text-sm">Distância: <strong className="text-blue-700">{atleta.modalidade} KM</strong></p>
                        </div>
                        <div className="bg-white border-2 border-slate-800 rounded-lg p-3 text-center min-w-[120px] shadow-sm">
                          <span className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Nº de Peito</span>
                          <span className="block text-4xl font-extrabold text-slate-800 leading-none">{atleta.numero}</span>
                        </div>
                     </div>
                   </div>
                 ))}
                 
                 <div className="mt-6 bg-yellow-50 border-l-4 border-yellow-500 p-4 rounded-r-md shadow-sm">
                    <div className="flex items-start">
                      <span className="text-xl mr-3 leading-none">⚠️</span>
                      <p className="text-sm text-yellow-800">
                        <strong>Observação Importante:</strong> A numeração do atleta informada acima é provisória e pode sofrer alterações por parte da organização até o dia oficial da entrega dos kits.
                      </p>
                    </div>
                 </div>
               </div>
             )}
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

            {inscricoes.length >= vagasTotais && !inscricaoSucesso && (
              <div className="m-6 bg-red-100 border border-red-400 text-red-700 px-4 py-4 rounded-lg text-center shadow-sm" role="alert">
                <strong className="font-bold block text-xl mb-1">Inscrições Encerradas!</strong>
                <span className="block sm:inline">Todas as vagas para este evento já foram preenchidas. Fique atento às próximas edições!</span>
              </div>
            )}

            {inscricaoSucesso ? (
              <div className="p-8 text-center bg-gray-50 border border-gray-100 m-6 rounded-xl shadow-inner">
                <h3 className="text-3xl font-bold text-green-600 mb-2">Inscrição Confirmada! 🎉</h3>
                <p className="text-gray-700 mb-4 text-lg">O seu número de peito oficial é:</p>
                <span className="text-6xl font-extrabold text-slate-800 block mb-4 tracking-wider">{inscricaoSucesso.numero}</span>
                
                <div className="bg-yellow-50 border-l-4 border-yellow-500 p-4 rounded-r-md shadow-sm mb-8 max-w-md mx-auto text-left">
                  <div className="flex items-start">
                    <span className="text-xl mr-3 leading-none">⚠️</span>
                    <p className="text-sm text-yellow-800">
                      <strong>Aviso:</strong> A numeração oficial poderá sofrer alterações por parte da organização até o dia da entrega dos kits.
                    </p>
                  </div>
                </div>

                {isEventoPago && (
                  <div className="bg-white p-6 rounded-xl shadow-md border border-gray-200 text-left inline-block w-full max-w-md mx-auto">
                    <h4 className="font-bold text-slate-800 mb-3 border-b pb-2 flex items-center">
                      <span className="text-xl mr-2">💳</span> Instruções de Pagamento
                    </h4>
                    <p className="text-sm text-gray-600 mb-2">Valor da inscrição: <strong className="text-xl text-green-700 ml-1">R$ {valorInscricao}</strong></p>
                    <p className="text-sm text-gray-600 mb-5">Chave PIX: <strong className="text-lg text-slate-800 ml-1 break-all bg-slate-100 px-2 py-1 rounded select-all">{chavePix}</strong></p>
                    <div className="bg-blue-50 border-l-4 border-blue-500 p-3 rounded-r text-sm text-blue-800 font-medium">
                      Faça o PIX e envie o comprovante para o WhatsApp: <br/><strong className="text-base mt-1 block">{telefoneContato}</strong>
                    </div>
                  </div>
                )}

                <button onClick={() => setInscricaoSucesso(null)} className="mt-8 bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-8 rounded-full shadow transition-transform transform hover:scale-105">
                  Fazer nova inscrição
                </button>
              </div>
            ) : (
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
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Data de Nascimento *</label>
                      <input type="date" name="dataNascimento" required min="1900-01-01" max={new Date().toISOString().split('T')[0]} value={formAtleta.dataNascimento} onChange={handleInputChange} className="w-full border border-gray-300 rounded-md shadow-sm p-2.5 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100 disabled:text-gray-500" disabled={inscricoes.length >= vagasTotais} />
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
                      <label className="block text-sm font-medium text-gray-700 mb-1">Categoria (Automática) *</label>
                      <select name="categoria" required value={formAtleta.categoria} onChange={handleInputChange} className="w-full border border-gray-300 rounded-md shadow-sm p-2.5 bg-gray-100 text-gray-600 pointer-events-none focus:outline-none" tabIndex="-1">
                        <option value="">
                          {formAtleta.dataNascimento 
                            ? (formAtleta.categoria ? formAtleta.categoria : "Idade fora do permitido") 
                            : "Preencha a data de nascimento primeiro"}
                        </option>
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
                  <button type="submit" disabled={inscricoes.length >= vagasTotais} className="w-full bg-blue-600 text-white font-bold py-4 px-4 rounded-md hover:bg-blue-700 transition duration-200 disabled:bg-gray-400 disabled:cursor-not-allowed shadow-md text-lg">
                    {inscricoes.length >= vagasTotais ? 'Vagas Esgotadas' : (isEventoPago ? `Inscrever-se (R$ ${valorInscricao})` : 'Confirmar Inscrição')}
                  </button>
                </div>
              </form>
            )}
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
              
              <div className="bg-white p-5 rounded-lg shadow-sm border border-gray-100">
                <h3 className="font-bold text-lg mb-4 text-gray-800 border-b pb-2">Configurações Gerais</h3>
                <div className="space-y-4">
                  <div><label className="block text-sm font-medium text-gray-700 mb-1">Nome do Evento</label><input type="text" value={nomeEvento} onChange={(e) => setNomeEvento(e.target.value)} className="w-full border rounded p-2 focus:ring-slate-500 focus:border-slate-500" /></div>
                  <div><label className="block text-sm font-medium text-gray-700 mb-1">Data e Hora</label><input type="datetime-local" value={dataEvento} onChange={(e) => setDataEvento(e.target.value)} className="w-full border rounded p-2 focus:ring-slate-500 focus:border-slate-500" /></div>
                  <div><label className="block text-sm font-medium text-gray-700 mb-1">Limite de Vagas</label><input type="number" value={vagasTotais} onChange={(e) => setVagasTotais(Number(e.target.value))} className="w-full border rounded p-2 focus:ring-slate-500 focus:border-slate-500" min="1" /></div>
                  <div><label className="block text-sm font-medium text-gray-700 mb-1">Contato (Rodapé)</label><input type="text" value={telefoneContato} onChange={(e) => setTelefoneContato(formatarTelefone(e.target.value))} className="w-full border rounded p-2 focus:ring-slate-500 focus:border-slate-500" /></div>
                  
                  <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
                    <label className="flex items-center space-x-2 mb-3 cursor-pointer">
                      <input type="checkbox" checked={isEventoPago} onChange={(e) => setIsEventoPago(e.target.checked)} className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500" />
                      <span className="text-sm font-bold text-blue-900">Cobrar inscrição (Evento Pago)</span>
                    </label>
                    {isEventoPago && (
                      <div className="flex space-x-2">
                        <div className="w-1/3">
                          <label className="block text-xs font-bold text-gray-700 mb-1">Valor (R$)</label>
                          <input type="text" value={valorInscricao} onChange={(e) => setValorInscricao(e.target.value)} placeholder="Ex: 50,00" className="w-full border rounded p-2 text-sm focus:ring-slate-500 focus:border-slate-500" />
                        </div>
                        <div className="flex-1">
                          <label className="block text-xs font-bold text-gray-700 mb-1">Chave PIX</label>
                          <input type="text" value={chavePix} onChange={(e) => setChavePix(e.target.value)} placeholder="E-mail, CPF ou Celular" className="w-full border rounded p-2 text-sm focus:ring-slate-500 focus:border-slate-500" />
                        </div>
                      </div>
                    )}
                  </div>

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

            <div className="flex justify-between items-center mt-8">
              <h3 className="text-xl font-bold text-slate-800">Inscritos Cadastrados</h3>
              <div className="space-x-3 flex items-center">
                <button onClick={() => setMostrarFormAdmin(!mostrarFormAdmin)} className="bg-blue-600 text-white px-4 py-2 rounded shadow hover:bg-blue-700 font-medium transition">
                  {mostrarFormAdmin ? '✖ Fechar Formulário' : '➕ Adicionar Manualmente'}
                </button>
                <button onClick={baixarPlanilha} className="bg-green-600 text-white px-4 py-2 rounded shadow hover:bg-green-700 font-medium transition">⬇ Baixar Planilha</button>
                <button onClick={limparInscricoes} className="bg-red-100 text-red-600 border border-red-200 px-4 py-2 rounded shadow hover:bg-red-600 hover:text-white font-medium transition">🗑 Limpar Tudo</button>
              </div>
            </div>

            {mostrarFormAdmin && (
              <div className="bg-blue-50 p-6 rounded-lg border border-blue-200 shadow-inner mb-6">
                <h4 className="font-bold text-blue-800 mb-4 border-b border-blue-200 pb-2">Nova Inscrição Manual (Ignora restrições)</h4>
                <form onSubmit={handleSubmitAdmin} className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-medium text-gray-700">Nome</label>
                    <input type="text" name="nome" required value={formAdmin.nome} onChange={handleAdminInputChange} className="w-full border rounded p-2 text-sm" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700">CPF</label>
                    <input type="text" name="cpf" required value={formAdmin.cpf} onChange={handleAdminInputChange} className="w-full border rounded p-2 text-sm" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700">Nascimento</label>
                    <input type="date" name="dataNascimento" required value={formAdmin.dataNascimento} onChange={handleAdminInputChange} className="w-full border rounded p-2 text-sm" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700">Sexo</label>
                    <select name="sexo" required value={formAdmin.sexo} onChange={handleAdminInputChange} className="w-full border rounded p-2 text-sm">
                      <option value="">Selecione</option><option value="M">M</option><option value="F">F</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700">Modalidade</label>
                    <select name="modalidade" required value={formAdmin.modalidade} onChange={handleAdminInputChange} className="w-full border rounded p-2 text-sm">
                      <option value="">Selecione</option>
                      {modalidades.map(mod => <option key={mod.km} value={mod.km}>{mod.km} KM</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700">Categoria</label>
                    <select name="categoria" required value={formAdmin.categoria} onChange={handleAdminInputChange} className="w-full border rounded p-2 text-sm">
                      <option value="">Selecione</option>
                      {categorias.map(cat => <option key={cat.nome} value={cat.nome}>{cat.nome}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700">Camiseta</label>
                    <select name="camiseta" required value={formAdmin.camiseta} onChange={handleAdminInputChange} className="w-full border rounded p-2 text-sm">
                      <option value="">Selecione</option>
                      {TAMANHOS_CAMISETA.map(tam => <option key={tam} value={tam}>{tam}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700">Município</label>
                    <select name="municipio" required value={formAdmin.municipio} onChange={handleAdminInputChange} className="w-full border rounded p-2 text-sm">
                      <option value="">Selecione</option>
                      {MUNICIPIOS_RO.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700">WhatsApp</label>
                    <input type="text" name="whatsapp" required value={formAdmin.whatsapp} onChange={handleAdminInputChange} className="w-full border rounded p-2 text-sm" />
                  </div>
                  <div className="sm:col-span-2 lg:col-span-1">
                    <label className="block text-xs font-medium text-gray-700">Equipe</label>
                    <input type="text" name="equipe" value={formAdmin.equipe} onChange={handleAdminInputChange} className="w-full border rounded p-2 text-sm" />
                  </div>
                  <div className="sm:col-span-3 lg:col-span-1 flex items-end">
                    <button type="submit" className="w-full bg-blue-700 text-white font-bold py-2 px-4 rounded hover:bg-blue-800 transition">Salvar</button>
                  </div>
                </form>
              </div>
            )}

            <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden mt-4">
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200 text-sm">
                  <thead className="bg-slate-100">
                    <tr>
                      <th className="px-4 py-3 text-left font-bold text-slate-600 uppercase tracking-wider">Data/Hora</th>
                      <th className="px-4 py-3 text-left font-bold text-slate-600 uppercase tracking-wider">Número</th>
                      <th className="px-4 py-3 text-left font-bold text-slate-600 uppercase tracking-wider">Nome Completo</th>
                      <th className="px-4 py-3 text-left font-bold text-slate-600 uppercase tracking-wider">CPF</th>
                      <th className="px-4 py-3 text-left font-bold text-slate-600 uppercase tracking-wider">Modalidade</th>
                      <th className="px-4 py-3 text-left font-bold text-slate-600 uppercase tracking-wider">WhatsApp</th>
                      <th className="px-4 py-3 text-center font-bold text-slate-600 uppercase tracking-wider">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {inscricoes.length === 0 ? (
                      <tr><td colSpan="7" className="px-4 py-8 text-center text-gray-500 italic">Nenhum atleta inscrito até o momento.</td></tr>
                    ) : (
                      inscricoes.map((insc, idx) => (
                        <tr key={idx} className="hover:bg-gray-50">
                          <td className="px-4 py-3 whitespace-nowrap text-gray-600">{insc.dataHora}</td>
                          <td className="px-4 py-3 whitespace-nowrap font-bold text-slate-800">{insc.numero}</td>
                          <td className="px-4 py-3 whitespace-nowrap font-medium text-gray-900">{insc.nome}</td>
                          <td className="px-4 py-3 whitespace-nowrap text-gray-600">{insc.cpf}</td>
                          <td className="px-4 py-3 whitespace-nowrap font-medium text-blue-600">{insc.modalidade ? `${insc.modalidade} KM` : '-'}</td>
                          <td className="px-4 py-3 whitespace-nowrap text-gray-600">{insc.whatsapp || insc.celular}</td>
                          <td className="px-4 py-3 whitespace-nowrap text-center">
                            <button onClick={() => removerInscricaoIndividual(insc.id, insc.nome)} className="text-red-500 hover:text-red-700 font-bold text-xs bg-red-50 px-2 py-1 rounded border border-red-200 hover:bg-red-100 transition">
                              Excluir
                            </button>
                          </td>
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