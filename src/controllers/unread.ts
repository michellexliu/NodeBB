import nconf from 'nconf';
import querystring from 'querystring';
import { Request, Response } from 'express';

import meta from '../meta';
import pagination from '../pagination';
import user from '../user';
import topics from '../topics';
import helpers from './helpers';

const relative_path: string = (nconf.get('relative_path') as string);

export async function get(req: Request, res: Response) {
  const { cid } = req.query;
  const filter = req.query.filter || "";

  const [categoryData, userSettings, isPrivileged] = await Promise.all([
    helpers.getSelectedCategory(cid),
    user.getSettings(req.uid),
    user.isPrivileged(req.uid),
  ]);

  const page = parseInt(req.query.page, 10) || 1;
  const start = Math.max(0, (page - 1) * userSettings.topicsPerPage);
  const stop = start + userSettings.topicsPerPage - 1;
  const data = await topics.getUnreadTopics({
    cid: cid,
    uid: req.uid,
    start: start,
    stop: stop,
    filter: filter,
    query: req.query,
  });

  const isDisplayedAsHome = !(
    req.originalUrl.startsWith(`${relative_path}/api/unread`) ||
    req.originalUrl.startsWith(`${relative_path}/unread`)
  );
  const baseUrl = isDisplayedAsHome ? "" : "unread";

  if (isDisplayedAsHome) {
    data.title = meta.config.homePageTitle || "[[pages:home]]";
  } else {
    data.title = "[[pages:unread]]";
    data.breadcrumbs = helpers.buildBreadcrumbs([{ text: "[[unread:title]]" }]);
  }

  data.pageCount = Math.max(
    1,
    Math.ceil(data.topicCount / userSettings.topicsPerPage)
  );
  data.pagination = pagination.create(page, data.pageCount, req.query);
  helpers.addLinkTags({
    url: "unread",
    res: req.res,
    tags: data.pagination.rel,
  });

  if (userSettings.usePagination && (page < 1 || page > data.pageCount)) {
    req.query.page = Math.max(1, Math.min(data.pageCount, page));
    return helpers.redirect(res, `/unread?${querystring.stringify(req.query)}`);
  }
  data.showSelect = true;
  data.showTopicTools = isPrivileged;
  data.allCategoriesUrl = `${baseUrl}${helpers.buildQueryString(
    req.query,
    "cid",
    ""
  )}`;
  data.selectedCategory = categoryData.selectedCategory;
  data.selectedCids = categoryData.selectedCids;
  data.selectCategoryLabel = "[[unread:mark_as_read]]";
  data.selectCategoryIcon = "fa-inbox";
  data.showCategorySelectLabel = true;
  data.filters = helpers.buildFilters(baseUrl, filter, req.query);
  data.selectedFilter = data.filters.find(
    (filter) => filter && filter.selected
  );

  res.render("unread", data);
};

export async function unreadTotal(req, res, next) {
  const filter = req.query.filter || "";
  try {
    const unreadCount = await topics.getTotalUnread(req.uid, filter);
    res.json(unreadCount);
  } catch (err) {
    next(err);
  }
};
