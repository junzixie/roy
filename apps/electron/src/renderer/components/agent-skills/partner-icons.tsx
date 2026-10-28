/** 工作伙伴图标：目录里存 lucide 名字，这里显式映射（避免引入整个图标表）。 */

import * as React from 'react'
import {
  BookHeart, Bug, ChartColumn, ChartPie, ChefHat, Clapperboard, ClipboardCheck, CodeXml, Database, Dumbbell,
  Feather, FilePen, FlaskConical, GraduationCap, HeartHandshake, Handshake, Kanban, Landmark, Languages, Mail,
  Megaphone, MessagesSquare, MonitorSmartphone, NotebookPen, Palette, PiggyBank, Plane, Presentation, Rocket,
  Scale, Search, Server, Sheet, ShieldCheck, ShoppingCart, Users, UserRound,
  type LucideIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils'

const ICONS: Record<string, LucideIcon> = {
  'book-heart': BookHeart, bug: Bug, 'chart-column': ChartColumn, 'chart-pie': ChartPie, 'chef-hat': ChefHat,
  clapperboard: Clapperboard, 'clipboard-check': ClipboardCheck, 'code-xml': CodeXml, database: Database,
  dumbbell: Dumbbell, feather: Feather, 'file-pen': FilePen, 'flask-conical': FlaskConical,
  'graduation-cap': GraduationCap, 'heart-handshake': HeartHandshake, handshake: Handshake, kanban: Kanban,
  landmark: Landmark, languages: Languages, mail: Mail, megaphone: Megaphone, 'messages-square': MessagesSquare,
  'monitor-smartphone': MonitorSmartphone, 'notebook-pen': NotebookPen, palette: Palette, 'piggy-bank': PiggyBank,
  plane: Plane, presentation: Presentation, rocket: Rocket, scale: Scale, search: Search, server: Server,
  sheet: Sheet, 'shield-check': ShieldCheck, 'shopping-cart': ShoppingCart, users: Users,
}

/** 分类底色：照 ZCode 插件页的实心圆角方块，白色图标 */
const CATEGORY_COLORS: Record<string, string> = {
  办公协同: '#2B579A',
  开发工具: '#3E63DD',
  数据分析: '#12A594',
  内容创作: '#F76B15',
  教育学习: '#6E56CF',
  投资理财: '#B08A3E',
  生活服务: '#0D9488',
  商业运营: '#D6409F',
  我的伙伴: '#30A46C',
}

export function PartnerAvatar({ icon, category, size = 40, className }: { icon?: string; category?: string; size?: number; className?: string }): React.ReactElement {
  const Icon = icon ? ICONS[icon] : UserRound
  const label = !Icon && icon ? icon.slice(0, 2) : ''
  const color = (category && CATEGORY_COLORS[category]) || '#6F6E77'
  return (
    <span
      className={cn('grid shrink-0 place-items-center text-white shadow-[inset_0_0_0_1px_rgba(0,0,0,0.06)]', className)}
      style={{
        width: size,
        height: size,
        borderRadius: Math.round(size * 0.28),
        background: `linear-gradient(135deg, ${color}, color-mix(in srgb, ${color} 78%, black))`,
      }}
    >
      {label ? <span className="font-semibold leading-none" style={{ fontSize: Math.round(size * (label.length > 1 ? 0.36 : 0.46)) }}>{label}</span> : React.createElement(Icon ?? UserRound, { size: Math.round(size * 0.52), strokeWidth: size < 24 ? 2.2 : 1.9 })}
    </span>
  )
}
