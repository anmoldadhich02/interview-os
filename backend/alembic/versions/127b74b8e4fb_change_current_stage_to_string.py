"""Change current_stage to String

Revision ID: 127b74b8e4fb
Revises: 91813091ced5
Create Date: 2026-08-07 02:45:42.473535

"""
from alembic import op
import sqlalchemy as sa


revision = '127b74b8e4fb'
down_revision = '91813091ced5'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.alter_column('interview_sessions', 'current_stage',
                    type_=sa.String(length=50),
                    existing_nullable=False,
                    postgresql_using='current_stage::text')
    
    op.execute("UPDATE interview_sessions SET current_stage = LOWER(current_stage)")


def downgrade() -> None:
    # Not creating enum back, as it's complex, just convert back to uppercase String
    op.execute("UPDATE interview_sessions SET current_stage = UPPER(current_stage)")
    
    # Ideally, we would alter the column back to enum here, but for simplicity
    # we just leave it as String(50) since downgrade is rarely used for type changes.
