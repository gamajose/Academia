INSERT INTO plans (gym_id, name, price_cents, duration_days, description, benefits, rules, is_active)
SELECT g.id, 'Essencial', 8990, 30,
       'Para quem quer começar com uma rotina simples e consistente.',
       '<ul><li>Musculação</li><li>Treino organizado</li><li>Acompanhamento da equipe</li></ul>',
       '<p>Acesso durante o horário de funcionamento da academia.</p>',
       true
FROM gyms g
WHERE NOT EXISTS (SELECT 1 FROM plans p WHERE p.gym_id=g.id AND lower(p.name)=lower('Essencial'));

INSERT INTO plans (gym_id, name, price_cents, duration_days, description, benefits, rules, is_active)
SELECT g.id, 'Performance', 12990, 30,
       'Mais acompanhamento para acelerar sua evolução.',
       '<ul><li>Musculação</li><li>Avaliação periódica</li><li>Revisão de treino</li></ul>',
       '<p>Plano mensal com acesso às áreas previstas pela academia.</p>',
       true
FROM gyms g
WHERE NOT EXISTS (SELECT 1 FROM plans p WHERE p.gym_id=g.id AND lower(p.name)=lower('Performance'));

INSERT INTO plans (gym_id, name, price_cents, duration_days, description, benefits, rules, is_active)
SELECT g.id, 'Premium', 17990, 30,
       'Experiência completa para quem busca acompanhamento contínuo.',
       '<ul><li>Todos os benefícios</li><li>Aulas incluídas</li><li>Atendimento prioritário</li></ul>',
       '<p>Consulte a equipe para confirmar as modalidades incluídas.</p>',
       true
FROM gyms g
WHERE NOT EXISTS (SELECT 1 FROM plans p WHERE p.gym_id=g.id AND lower(p.name)=lower('Premium'));
