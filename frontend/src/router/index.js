import { createRouter, createWebHashHistory } from 'vue-router'

import DictsPage from '../views/DictsPage.vue'
import AiReviewPage from '../views/AiReviewPage.vue'
import QuestionVerifyPage from '../views/QuestionVerifyPage.vue'
import QuestionsPage from '../views/QuestionsPage.vue'
import PaperGeneratePage from '../views/PaperGeneratePage.vue'
import PapersManagePage from '../views/PapersManagePage.vue'
import AnswerSheetsPage from '../views/AnswerSheetsPage.vue'
import TextbooksPage from '../views/TextbooksPage.vue'
import LoginPage from '../views/LoginPage.vue'
import LandingPage from '../views/LandingPage.vue'
import PersonalCenter from '../views/PersonalCenter.vue'
import AnswerPage from '../views/AnswerPage.vue'
import WrongQuestionsPage from '../views/WrongQuestionsPage.vue'
import SmartPracticePage from '../views/SmartPracticePage.vue'
import ReferenceLibraryPage from '../views/ReferenceLibraryPage.vue'

import { getToken } from '../auth'

export const router = createRouter({
  // GitHub Pages 静态托管无 SPA 回退，用 hash 模式保证刷新子页面不 404
  history: createWebHashHistory(),
  routes: [
    { path: '/landing', component: LandingPage, meta: { title: '首页' } },
    { path: '/login', component: LoginPage, meta: { title: '登录' } },
    { path: '/', redirect: '/landing' },
    { path: '/dicts', component: DictsPage, meta: { requiresAuth: true, title: '基础信息' } },
    { path: '/ai-review', redirect: '/ai-review/text' },
    { path: '/ai-review/text', component: AiReviewPage, meta: { requiresAuth: true, title: 'AI出题' } },
    { path: '/ai-review/paper', component: AiReviewPage, meta: { requiresAuth: true, title: '试卷变式' } },
    { path: '/ai-review/file', component: AiReviewPage, meta: { requiresAuth: true, title: '文档变式' } },
    { path: '/ai-review/ai-import', component: AiReviewPage, meta: { requiresAuth: true, title: 'AI智能导入' } },
    { path: '/question-verify', component: QuestionVerifyPage, meta: { requiresAuth: true, title: '题目校验' } },
    { path: '/textbooks', component: TextbooksPage, meta: { requiresAuth: true, title: '教材管理' } },
    { path: '/reference-library', component: ReferenceLibraryPage, meta: { requiresAuth: true, title: '知识库' } },
    { path: '/questions', component: QuestionsPage, meta: { requiresAuth: true, title: '题库管理' } },
    { path: '/paper-generate', component: PaperGeneratePage, meta: { requiresAuth: true, title: '智能组卷' } },
    { path: '/papers', component: PapersManagePage, meta: { requiresAuth: true, title: '试卷编辑/导出', mode: 'export' } },
    { path: '/paper-review', component: PapersManagePage, meta: { requiresAuth: true, title: '试卷审核', mode: 'review' } },
    { path: '/answer-sheets', component: AnswerSheetsPage, meta: { requiresAuth: true, title: '答题卡' } },
    { path: '/practice/paper', name: 'paper-practice', component: () => import('../views/PracticePage.vue'), meta: { requiresAuth: true, title: '试卷练习' } },
    { path: '/practice/temporary', name: 'smart-practice', component: SmartPracticePage, meta: { requiresAuth: true, title: '试题练习' } },
    { path: '/answer', name: 'answer', component: AnswerPage, meta: { requiresAuth: true, title: '答题' } },
    { path: '/wrong-questions', name: 'wrong-questions', component: WrongQuestionsPage, meta: { requiresAuth: true, title: '错题本' } },
    { path: '/me', component: PersonalCenter, meta: { requiresAuth: true, title: '个人中心' } },
  ],
})

router.beforeEach((to) => {
  if (to.meta.title) {
    document.title = `${to.meta.title} - 智能组卷系统`
  } else {
    document.title = '智能组卷系统'
  }

  if (to.path === '/login') {
    if (getToken()) return { path: '/dicts' }
    return true
  }
  if (to.path === '/landing') {
    if (getToken()) return { path: '/dicts' }
    return true
  }
  if (to.meta?.requiresAuth && !getToken()) {
    return { path: '/landing' }
  }
  return true
})
