import React, { useState, useEffect, useRef } from 'react';
import { supabase } from './lib/supabase';
import { analyzeQuestion, generateTextAnalysis } from './lib/gemini';
import { 
  DashboardKPIs, 
  MonthlyRevenue, 
  RevenueByCategory, 
  TopProduct, 
  TopCity, 
  TopSeller, 
  DiscountAnalysis, 
  GenderCategoryAnalysis 
} from './types';
import { 
  Chart as ChartJS, 
  CategoryScale, 
  LinearScale, 
  PointElement, 
  LineElement, 
  BarElement, 
  ArcElement, 
  Title, 
  Tooltip, 
  Legend, 
  Filler 
} from 'chart.js';
import { Line, Bar, Pie } from 'react-chartjs-2';
import { 
  LayoutDashboard, 
  MessageSquare, 
  TrendingUp, 
  ShoppingBag, 
  Users, 
  DollarSign, 
  Filter, 
  ChevronDown, 
  ChevronUp, 
  Send, 
  Database,
  Search,
  PieChart,
  BarChart3,
  ArrowUpRight,
  Loader2
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { format } from 'date-fns';
import { ru } from 'date-fns/locale';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

const formatCurrency = (value: number) => {
  return new Intl.NumberFormat('ru-RU', {
    maximumFractionDigits: 0,
  }).format(value);
};

const formatNumber = (value: number) => {
  return new Intl.NumberFormat('ru-RU', {
    maximumFractionDigits: 0,
  }).format(value);
};

export default function App() {
  const [isConnected, setIsConnected] = useState<boolean | null>(null);
  const [isDashboardOpen, setIsDashboardOpen] = useState(true);
  const [kpis, setKpis] = useState<DashboardKPIs | null>(null);
  const [monthlyRev, setMonthlyRev] = useState<MonthlyRevenue[]>([]);
  const [revByCategory, setRevByCategory] = useState<RevenueByCategory[]>([]);
  const [topProductsData, setTopProductsData] = useState<TopProduct[]>([]);
  const [topCitiesData, setTopCitiesData] = useState<TopCity[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [selectedCity, setSelectedCity] = useState<string>('Все');
  const [selectedCategory, setSelectedCategory] = useState<string>('Все');
  const [cities, setCities] = useState<string[]>([]);
  const [categories, setCategories] = useState<string[]>([]);

  // Chat
  const [messages, setMessages] = useState<{ role: 'user' | 'ai'; content: string; data?: any; vizType?: string }[]>([]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    checkConnection();
    fetchFilterOptions();
  }, []);

  useEffect(() => {
    fetchDashboardData();
  }, [selectedCity, selectedCategory]);

  useEffect(() => {
    scrollToBottom();
  }, [messages, isTyping]);

  const scrollToBottom = () => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const checkConnection = async () => {
    try {
      const { data, error } = await supabase.from('cities').select('CityName').limit(1);
      if (error) throw error;
      setIsConnected(true);
    } catch (err) {
      console.error('Supabase connection error:', err);
      setIsConnected(false);
    }
  };

  const fetchFilterOptions = async () => {
    try {
      const [
        { data: citiesList },
        { data: categoriesList }
      ] = await Promise.all([
        supabase.from('cities').select('CityName').order('CityName'),
        supabase.from('categories').select('CategoryName').order('CategoryName')
      ]);

      if (citiesList) setCities(['Все', ...citiesList.map((c: any) => c.CityName)]);
      if (categoriesList) setCategories(['Все', ...categoriesList.map((c: any) => c.CategoryName)]);
    } catch (err) {
      console.error('Error fetching filter options:', err);
    }
  };

  const fetchDashboardData = async () => {
    setLoading(true);
    try {
      let allSalesData: any[] = [];
      let hasMore = true;
      let page = 0;
      const pageSize = 1000;

      while (hasMore) {
        let query = supabase
          .from('sales')
          .select(`
            CustomerID,
            Quantity,
            Discount,
            SalesDate,
            products!inner (
              ProductName,
              Price,
              categories!inner (
                CategoryName
              )
            ),
            customers!inner (
              cities!inner (
                CityName
              )
            )
          `)
          .range(page * pageSize, (page + 1) * pageSize - 1);

        if (selectedCity !== 'Все') {
          query = query.eq('customers.cities.CityName', selectedCity);
        }
        if (selectedCategory !== 'Все') {
          query = query.eq('products.categories.CategoryName', selectedCategory);
        }

        const { data: salesData, error: salesError } = await query;

        if (salesError) throw salesError;

        if (salesData && salesData.length > 0) {
          allSalesData = [...allSalesData, ...salesData];
          if (salesData.length < pageSize) {
            hasMore = false;
          } else {
            page++;
          }
        } else {
          hasMore = false;
        }
      }

      if (allSalesData.length === 0) {
        setKpis({ total_revenue: 0, total_sales: 0, unique_customers: 0, avg_check: 0 });
        setMonthlyRev([]);
        setRevByCategory([]);
        setTopProductsData([]);
        setTopCitiesData([]);
        return;
      }

      const kpis = {
        total_revenue: 0,
        total_sales: 0,
        unique_customers: new Set(),
        avg_check: 0
      };

      const monthlyMap = new Map();
      const categoryMap = new Map();
      const productMap = new Map();
      const cityMap = new Map();

      allSalesData.forEach((sale: any) => {
        const quantity = sale.Quantity || 0;
        const discount = sale.Discount || 0;
        const price = sale.products?.Price || 0;
        const rev = quantity * price * (1 - discount);
        
        const month = sale.SalesDate ? sale.SalesDate.substring(0, 7) : 'Unknown';
        const cat = sale.products?.categories?.CategoryName || 'Unknown';
        const prod = sale.products?.ProductName || 'Unknown';
        const city = sale.customers?.cities?.CityName || 'Unknown';

        // KPIs
        kpis.total_revenue += rev;
        kpis.total_sales += 1;
        if (sale.CustomerID) kpis.unique_customers.add(sale.CustomerID);

        // Monthly
        monthlyMap.set(month, (monthlyMap.get(month) || 0) + rev);
        
        // Category
        if (!categoryMap.has(cat)) categoryMap.set(cat, { rev: 0, count: 0 });
        categoryMap.get(cat).rev += rev;
        categoryMap.get(cat).count += 1;

        // Product
        productMap.set(prod, (productMap.get(prod) || 0) + rev);

        // City
        if (!cityMap.has(city)) cityMap.set(city, { rev: 0, count: 0 });
        cityMap.get(city).rev += rev;
        cityMap.get(city).count += 1;
      });

      kpis.avg_check = kpis.total_sales > 0 ? kpis.total_revenue / kpis.total_sales : 0;

      setKpis({
        total_revenue: kpis.total_revenue,
        total_sales: kpis.total_sales,
        unique_customers: kpis.unique_customers.size,
        avg_check: kpis.avg_check
      });

      setMonthlyRev(
        Array.from(monthlyMap.entries())
          .map(([month, revenue]) => ({ month, revenue }))
          .sort((a, b) => a.month.localeCompare(b.month))
      );

      setRevByCategory(
        Array.from(categoryMap.entries())
          .map(([category_name, data]) => ({ category_name, total_revenue: data.rev, sales_count: data.count }))
          .sort((a, b) => b.total_revenue - a.total_revenue)
      );

      setTopProductsData(
        Array.from(productMap.entries())
          .map(([product_name, total_revenue]) => ({ product_name, total_revenue }))
          .sort((a, b) => b.total_revenue - a.total_revenue)
          .slice(0, 10)
      );

      setTopCitiesData(
        Array.from(cityMap.entries())
          .map(([city_name, data]) => ({ city_name, total_revenue: data.rev, sales_count: data.count }))
          .sort((a, b) => b.total_revenue - a.total_revenue)
          .slice(0, 10)
      );

    } catch (err) {
      console.error('Error fetching dashboard data:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSendMessage = async (text?: string) => {
    const query = text || input;
    if (!query.trim()) return;

    setMessages(prev => [...prev, { role: 'user', content: query }]);
    if (!text) setInput('');
    setIsTyping(true);

    try {
      const analysis = await analyzeQuestion(query);
      const { data, error } = await supabase.rpc(analysis.functionName, analysis.params);

      if (error) throw error;

      const textResponse = await generateTextAnalysis(query, data);
      setMessages(prev => [...prev, { 
        role: 'ai', 
        content: textResponse, 
        data: data, 
        vizType: analysis.visualizationType 
      }]);
    } catch (err) {
      console.error('AI Assistant error:', err);
      setMessages(prev => [...prev, { 
        role: 'ai', 
        content: 'Не удалось получить данные, переформулируйте вопрос.' 
      }]);
    } finally {
      setIsTyping(false);
    }
  };

  const renderVisualization = (vizType: string, data: any) => {
    if (!data || data.length === 0) return null;

    switch (vizType) {
      case 'line':
        return (
          <div className="h-64 w-full mt-4 bg-white p-4 rounded-xl border border-slate-100 shadow-sm">
            <Line 
              data={{
                labels: data.map((d: any) => d.month || d.category_name || d.seller_name || d.city_name),
                datasets: [{
                  label: 'Выручка',
                  data: data.map((d: any) => d.revenue || d.total_revenue),
                  borderColor: '#10b981',
                  backgroundColor: 'rgba(16, 185, 129, 0.1)',
                  fill: true,
                  tension: 0.4,
                }]
              }}
              options={{
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: {
                  y: { ticks: { callback: (val) => formatCurrency(val as number) } }
                }
              }}
            />
          </div>
        );
      case 'bar':
        return (
          <div className="h-64 w-full mt-4 bg-white p-4 rounded-xl border border-slate-100 shadow-sm">
            <Bar 
              data={{
                labels: data.map((d: any) => d.category_name || d.product_name || d.seller_name || d.city_name || d.discount_range),
                datasets: [{
                  label: 'Выручка',
                  data: data.map((d: any) => d.total_revenue),
                  backgroundColor: '#6366f1',
                  borderRadius: 6,
                }]
              }}
              options={{
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: {
                  y: { ticks: { callback: (val) => formatCurrency(val as number) } }
                }
              }}
            />
          </div>
        );
      case 'pie':
        return (
          <div className="h-64 w-full mt-4 bg-white p-4 rounded-xl border border-slate-100 shadow-sm flex justify-center">
            <Pie 
              data={{
                labels: data.map((d: any) => d.city_name || d.category_name || d.gender),
                datasets: [{
                  data: data.map((d: any) => d.total_revenue || d.sales_count),
                  backgroundColor: ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'],
                }]
              }}
              options={{
                responsive: true,
                maintainAspectRatio: false,
              }}
            />
          </div>
        );
      case 'table':
        const keys = Object.keys(data[0]);
        return (
          <div className="mt-4 overflow-x-auto rounded-xl border border-slate-100 shadow-sm">
            <table className="w-full text-sm text-left text-slate-500">
              <thead className="text-xs text-slate-700 uppercase bg-slate-50">
                <tr>
                  {keys.map(k => <th key={k} className="px-4 py-3">{k}</th>)}
                </tr>
              </thead>
              <tbody>
                {data.slice(0, 5).map((row: any, i: number) => (
                  <tr key={i} className="bg-white border-b hover:bg-slate-50">
                    {keys.map(k => (
                      <td key={k} className="px-4 py-3">
                        {typeof row[k] === 'number' && k.includes('revenue') ? formatCurrency(row[k]) : row[k]}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-900 flex flex-col">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 px-4 py-3 flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <div className="bg-emerald-500 p-2 rounded-lg">
            <ShoppingBag className="text-white w-6 h-6" />
          </div>
          <h1 className="text-xl font-bold tracking-tight">Аналитик продаж Green Mall</h1>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 text-sm font-medium">
            <div className={cn("w-2 h-2 rounded-full", isConnected ? "bg-emerald-500" : "bg-red-500")} />
            <span className="text-slate-500">Supabase:</span>
            <span className={isConnected ? "text-emerald-600" : "text-red-600"}>
              {isConnected === null ? "Подключение..." : isConnected ? "Подключено" : "Ошибка"}
            </span>
          </div>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Dashboard Toggle */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-slate-500">
            <LayoutDashboard className="w-5 h-5" />
            <h2 className="font-semibold">Дашборд аналитики</h2>
          </div>
          <button 
            onClick={() => setIsDashboardOpen(!isDashboardOpen)}
            className="p-2 hover:bg-slate-100 rounded-full transition-colors"
          >
            {isDashboardOpen ? <ChevronUp /> : <ChevronDown />}
          </button>
        </div>

        <AnimatePresence>
          {isDashboardOpen && (
            <motion.div 
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="space-y-4 overflow-hidden"
            >
              {/* Filters */}
              <div className="flex flex-wrap gap-4 bg-white p-3 rounded-xl border border-slate-200 shadow-sm items-center">
                <div className="flex items-center gap-2 pr-4 border-r border-slate-100">
                  <Filter className="w-4 h-4 text-slate-400" />
                  <span className="text-sm font-bold text-slate-700">Фильтры</span>
                </div>
                
                <div className="flex items-center gap-2">
                  <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Город:</label>
                  <select 
                    value={selectedCity}
                    onChange={(e) => setSelectedCity(e.target.value)}
                    className="bg-slate-50 border border-slate-200 text-sm rounded-lg px-2 py-1.5 outline-none focus:ring-2 focus:ring-emerald-500/20 min-w-[120px]"
                  >
                    {cities.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>

                <div className="flex items-center gap-2">
                  <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Категория:</label>
                  <select 
                    value={selectedCategory}
                    onChange={(e) => setSelectedCategory(e.target.value)}
                    className="bg-slate-50 border border-slate-200 text-sm rounded-lg px-2 py-1.5 outline-none focus:ring-2 focus:ring-emerald-500/20 min-w-[120px]"
                  >
                    {categories.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
              </div>

              {/* KPI Cards */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
                {[
                  { label: 'Общая выручка', value: formatCurrency(kpis?.total_revenue || 0), icon: DollarSign, color: 'text-emerald-600', bg: 'bg-emerald-50' },
                  { label: 'Кол-во продаж', value: formatNumber(kpis?.total_sales || 0), icon: TrendingUp, color: 'text-blue-600', bg: 'bg-blue-50' },
                  { label: 'Уникальных покупателей', value: formatNumber(kpis?.unique_customers || 0), icon: Users, color: 'text-amber-600', bg: 'bg-amber-50' },
                  { label: 'Средний чек', value: formatCurrency(kpis?.avg_check || 0), icon: ArrowUpRight, color: 'text-indigo-600', bg: 'bg-indigo-50' },
                ].map((kpi, i) => (
                  <motion.div 
                    key={i}
                    initial={{ y: 20, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    transition={{ delay: i * 0.1 }}
                    className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center gap-3"
                  >
                    <div className={cn("p-2 rounded-lg", kpi.bg)}>
                      <kpi.icon className={cn("w-5 h-5", kpi.color)} />
                    </div>
                    <div>
                      <p className="text-xs font-medium text-slate-500">{kpi.label}</p>
                      <p className="text-xl font-bold tracking-tight">{kpi.value}</p>
                    </div>
                  </motion.div>
                ))}
              </div>

              {/* Charts Grid */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/* Monthly Revenue */}
                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                  <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
                    <TrendingUp className="w-5 h-5 text-emerald-500" />
                    Выручка по месяцам
                  </h3>
                  <div className="h-80">
                    <Line 
                      data={{
                        labels: monthlyRev.map(d => d.month),
                        datasets: [
                          {
                            label: 'Реальная выручка',
                            data: monthlyRev.map(d => d.revenue),
                            borderColor: '#10b981',
                            backgroundColor: 'rgba(16, 185, 129, 0.1)',
                            fill: true,
                            tension: 0.4,
                          }
                        ]
                      }}
                      options={{
                        responsive: true,
                        maintainAspectRatio: false,
                        plugins: { tooltip: { callbacks: { label: (ctx) => formatCurrency(ctx.raw as number) } } },
                        scales: { y: { ticks: { callback: (val) => formatCurrency(val as number) } } }
                      }}
                    />
                  </div>
                </div>

                {/* Revenue by Category */}
                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                  <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
                    <BarChart3 className="w-5 h-5 text-blue-500" />
                    Продажи по категориям
                  </h3>
                  <div className="h-80">
                    <Bar 
                      data={{
                        labels: revByCategory.map(d => d.category_name),
                        datasets: [{
                          label: 'Выручка',
                          data: revByCategory.map(d => d.total_revenue),
                          backgroundColor: '#6366f1',
                          borderRadius: 6,
                        }]
                      }}
                      options={{
                        responsive: true,
                        maintainAspectRatio: false,
                        plugins: { tooltip: { callbacks: { label: (ctx) => formatCurrency(ctx.raw as number) } } },
                        scales: { y: { ticks: { callback: (val) => formatCurrency(val as number) } } }
                      }}
                    />
                  </div>
                </div>

                {/* Top 10 Products */}
                <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                  <h3 className="text-lg font-bold mb-6 flex items-center gap-2">
                    <ShoppingBag className="w-5 h-5 text-amber-500" />
                    Топ-10 товаров
                  </h3>
                  <div className="h-80">
                    <Bar 
                      data={{
                        labels: topProductsData.map(d => d.product_name),
                        datasets: [{
                          label: 'Выручка',
                          data: topProductsData.map(d => d.total_revenue),
                          backgroundColor: '#f59e0b',
                          borderRadius: 4,
                        }]
                      }}
                      options={{
                        indexAxis: 'y',
                        responsive: true,
                        maintainAspectRatio: false,
                        plugins: { legend: { display: false } },
                        scales: { x: { ticks: { callback: (val) => formatCurrency(val as number) } } }
                      }}
                    />
                  </div>
                </div>

                {/* Top 10 Cities */}
                <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                  <h3 className="text-lg font-bold mb-6 flex items-center gap-2">
                    <PieChart className="w-5 h-5 text-indigo-500" />
                    Топ-10 городов
                  </h3>
                  <div className="h-80 flex justify-center">
                    <Pie 
                      data={{
                        labels: topCitiesData.map(d => d.city_name),
                        datasets: [{
                          data: topCitiesData.map(d => d.total_revenue),
                          backgroundColor: ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#f97316', '#84cc16', '#0ea5e9'],
                        }]
                      }}
                      options={{
                        responsive: true,
                        maintainAspectRatio: false,
                      }}
                    />
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* AI Assistant Section */}
        <div className="flex-1 flex flex-col min-h-[400px] bg-white rounded-2xl border border-slate-200 shadow-lg overflow-hidden">
          <div className="bg-slate-900 text-white p-4 flex items-center gap-3">
            <div className="bg-emerald-500 p-2 rounded-full">
              <MessageSquare className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-bold text-sm">AI-Ассистент Green Mall</h2>
              <p className="text-xs text-slate-400">Задайте вопрос о продажах</p>
            </div>
          </div>

          {/* Chat Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50/50">
            {messages.length === 0 && (
              <div className="h-full flex flex-col items-center justify-center text-center space-y-3 opacity-50">
                <Search className="w-10 h-10 text-slate-300" />
                <p className="text-slate-500 max-w-xs text-sm">
                  Спросите меня о динамике продаж, топ-товарах или влиянии скидок.
                </p>
              </div>
            )}
            {messages.map((msg, i) => (
              <motion.div 
                key={i}
                initial={{ opacity: 0, x: msg.role === 'user' ? 20 : -20 }}
                animate={{ opacity: 1, x: 0 }}
                className={cn("flex", msg.role === 'user' ? "justify-end" : "justify-start")}
              >
                <div className={cn(
                  "max-w-[85%] p-4 rounded-2xl shadow-sm",
                  msg.role === 'user' 
                    ? "bg-emerald-600 text-white rounded-tr-none" 
                    : "bg-white border border-slate-200 text-slate-800 rounded-tl-none"
                )}>
                  <p className="text-sm leading-relaxed whitespace-pre-wrap">{msg.content}</p>
                  {msg.data && renderVisualization(msg.vizType || 'table', msg.data)}
                </div>
              </motion.div>
            ))}
            {isTyping && (
              <div className="flex justify-start">
                <div className="bg-white border border-slate-200 p-4 rounded-2xl rounded-tl-none shadow-sm flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin text-emerald-500" />
                  <span className="text-sm text-slate-500">Анализирую данные...</span>
                </div>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          {/* Quick Questions */}
          <div className="px-4 py-2 bg-white border-t border-slate-100 flex gap-2 overflow-x-auto no-scrollbar">
            {[
              'Продажи по месяцам',
              'Топ категорий',
              'Прогноз продаж',
              'Анализ по городам',
              'Топ продавцов'
            ].map(q => (
              <button 
                key={q}
                onClick={() => handleSendMessage(q)}
                className="whitespace-nowrap px-4 py-2 bg-slate-100 hover:bg-emerald-50 hover:text-emerald-700 text-slate-600 text-xs font-medium rounded-full transition-all"
              >
                {q}
              </button>
            ))}
          </div>

          {/* Input Area */}
          <div className="p-3 bg-white border-t border-slate-200">
            <form 
              onSubmit={(e) => { e.preventDefault(); handleSendMessage(); }}
              className="relative flex items-center"
            >
              <input 
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Напишите ваш вопрос..."
                className="w-full bg-slate-100 border-none rounded-xl px-4 py-3 pr-12 text-sm outline-none focus:ring-2 focus:ring-emerald-500/20 transition-all"
              />
              <button 
                type="submit"
                disabled={!input.trim() || isTyping}
                className="absolute right-2 p-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 text-white rounded-lg transition-all"
              >
                <Send className="w-4 h-4" />
              </button>
            </form>
          </div>
        </div>
      </main>
    </div>
  );
}
