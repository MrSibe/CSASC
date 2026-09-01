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
			sidebar: [
				{
					label: '网站导航',
					items: [
						{ label: '首页', slug: '' },
						{ label: '活动介绍', slug: 'portfolio' },
						{ label: '搜寻教程', slug: 'tutor' },
						{ label: '报名参与', slug: 'application' },
					],
				},
				{
					label: '相关链接',
					items: [{ label: 'IASC 官网', link: 'https://iasc.cosmosearch.org/' }],
				},
			],
		}),
	],
});
