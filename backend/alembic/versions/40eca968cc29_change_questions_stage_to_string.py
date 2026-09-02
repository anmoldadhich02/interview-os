"""Change questions stage to String

Revision ID: 40eca968cc29
Revises: 127b74b8e4fb
Create Date: 2026-08-07 02:47:25.319258

"""
from alembic import op
import sqlalchemy as sa


revision = '40eca968cc29'
down_revision = '127b74b8e4fb'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.alter_column('questions', 'stage',
                    type_=sa.String(length=50),
                    existing_nullable=False,
                    postgresql_using='stage::text')
    
    op.execute("UPDATE questions SET stage = LOWER(stage)")


def downgrade() -> None:
    op.execute("UPDATE questions SET stage = UPPER(stage)")
