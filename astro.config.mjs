// @ts-check
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';

export default defineConfig({
	site: 'https://skywatcher.pages.dev',
	trailingSlash: 'never',
	build: {
		format: 'file',
	},
	integrations: [
		starlight({
			title: '中国观天者小行星搜寻项目',
			description:
				'中国观天者小行星搜寻项目（CSASC）——面向中小学生与天文爱好者的免费公民科学活动。',
			favicon: '/favicon.ico',
			defaultLocale: 'zh-cn',
			locales: {
				root: {
					label: '简体中文',
					lang: 'zh-CN',
				},
			},
			customCss: ['./src/styles/custom.css'],
			// 不使用站点内搜索，顶栏不显示搜索框。
			pagefind: false,
			// 不显示右侧目录。
			tableOfContents: false,
			// 页脚不显示上一页/下一页。
			pagination: false,
			// 导航移入顶栏：自定顶栏，去掉左右侧栏。
			components: {
				Header: './src/components/Header.astro',
				PageFrame: './src/components/PageFrame.astro',
				Sidebar: './src/components/Sidebar.astro',
				Pagination: './src/components/Sidebar.astro',
			},
			head: [
				{
					tag: 'link',
					attrs: { rel: 'apple-touch-icon', href: '/icons/apple-icon-180.png' },
				},
				{
					tag: 'meta',
					attrs: { name: 'theme-color', content: '#0a0f1e' },
				},
				{
					tag: 'meta',
					attrs: { property: 'og:image', content: 'https://skywatcher.pages.dev/icons/icon-512.png' },
				},
			],
		}),
	],
});
