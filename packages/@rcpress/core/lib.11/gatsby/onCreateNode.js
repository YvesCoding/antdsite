/* eslint-disable camelcase */
/* eslint-disable no-case-declarations */
/* eslint-disable default-case */
/* eslint-disable no-multi-assign */
const path = require('path');
const fs = require('fs');
const fetch = require('node-fetch');
const himalaya = require('himalaya');
var { themeConfig } = require('../config').getFinalConfig();

// // 获取用户的头像列表
const getAvatarList = async filename => {
  const sourcePath = `https://github.com/${themeConfig.docsRepo || themeConfig.repo}/contributors/${
    themeConfig.docsBranch
  }/`;
  const url = `${sourcePath}${filename}/list`;
  const html = await fetch(url, {
    timeout: 10000
  }).then(res => res.text(), () => null);
  if (!html) return [];

  const ast = himalaya.parse(html)[0].children || [];
  const data = ast
    .map(item => {
      if (item.type === 'element') {
        const AlinkAST = item.children[1];
        const href = AlinkAST.attributes.find(({ key }) => key === 'href').value;
        const img = AlinkAST.children[1];
        const text = AlinkAST.children[2].content;
        const src = img.attributes.find(({ key }) => key === 'src').value;
        return {
          href,
          text,
          src
        };
      }
      return null;
    })
    .filter(item => item && item.src);
  return data;
};

function normalizeSlug(slug) {
  if (!slug.startsWith('/')) {
    slug = '/' + slug;
  }

  return slug;
}

// Add custom fields to MarkdownRemark nodes.
module.exports = exports.onCreateNode = async ({ node, actions, getNode }) => {
  const { createNodeField } = actions;
  switch (node.internal.type) {
    case 'Mdx':
      const { relativePath, sourceInstanceName } = getNode(node.parent);

      let slug;
      const filePath = node.fileAbsolutePath; // path.join(process.cwd(), sourceInstanceName, relativePath);
      const stats = fs.statSync(filePath);
      const mtime = new Date(stats.mtime).getTime();
      const mdFilePath = path.join(themeConfig.docsRelativeDir, sourceInstanceName, relativePath);

      createNodeField({
        node,
        name: `modifiedTime`,
        value: mtime
      });

      slug = normalizeSlug(`${relativePath.replace(/(readme)?\.mdx?/i, '')}`);

      createNodeField({
        node,
        name: 'slug',
        value: slug
      });

      createNodeField({
        node,
        name: 'path',
        value: mdFilePath
      });

      if (themeConfig.showAvatarList) {
        const html = await getAvatarList(mdFilePath);
        createNodeField({
          node,
          name: 'avatarList',
          value: html
        });
      }
  }
};
